-- Phase 3: import wizard, plus indexed duplicate matching so imports and scans scale.
-- Idempotent.

-- ---------------------------------------------------------------------------
-- Indexes for matching
-- ---------------------------------------------------------------------------
create index if not exists constituents_lower_display_name_trgm on constituents using gin (lower(display_name) gin_trgm_ops);
create index if not exists constituents_org_lower_last_idx on constituents (org_id, lower(coalesce(last_name, '')));
create index if not exists constituent_addresses_org_zip5_idx on constituent_addresses (org_id, left(regexp_replace(coalesce(postal_code, ''), '\s', '', 'g'), 5));

-- find_duplicates, rewritten to gather candidates through indexes before scoring.
create or replace function app.find_duplicates(
  p_org uuid, p_first text, p_last text, p_email text default null, p_phone text default null, p_postal text default null, p_exclude uuid default null
) returns table (id uuid, display_name text, score real, reasons text[])
language plpgsql stable security invoker as $$
declare v_name text := lower(trim(concat_ws(' ', p_first, p_last)));
        v_email text := lower(trim(coalesce(p_email, '')));
        v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
        v_postal text := left(regexp_replace(coalesce(p_postal, ''), '\s', '', 'g'), 5);
        v_last text := lower(trim(coalesce(p_last, '')));
begin
  if length(v_digits) = 11 and left(v_digits, 1) = '1' then v_digits := substr(v_digits, 2); end if;
  return query
  with ids as (
    select e.constituent_id as cid from constituent_emails e where v_email <> '' and e.org_id = p_org and e.email = v_email
    union select p.constituent_id from constituent_phones p where length(v_digits) >= 7 and p.org_id = p_org and p.digits = v_digits
    union select c.id from constituents c where v_name <> '' and c.org_id = p_org and lower(c.display_name) % v_name
    union select a.constituent_id from constituent_addresses a join constituents c on c.id = a.constituent_id
           where v_postal <> '' and v_last <> '' and a.org_id = p_org
             and left(regexp_replace(coalesce(a.postal_code, ''), '\s', '', 'g'), 5) = v_postal and lower(coalesce(c.last_name, '')) = v_last
  ),
  cand as (
    select c.id, c.display_name,
      (v_email <> '' and exists (select 1 from constituent_emails e where e.constituent_id = c.id and e.email = v_email)) as same_email,
      (length(v_digits) >= 7 and exists (select 1 from constituent_phones p where p.constituent_id = c.id and p.digits = v_digits)) as same_phone,
      similarity(lower(c.display_name), v_name) as name_sim,
      (v_postal <> '' and v_last <> '' and lower(coalesce(c.last_name, '')) = v_last
         and exists (select 1 from constituent_addresses a where a.constituent_id = c.id and left(regexp_replace(coalesce(a.postal_code, ''), '\s', '', 'g'), 5) = v_postal)) as same_last_postal
    from constituents c join ids on ids.cid = c.id
    where (p_exclude is null or c.id <> p_exclude)
  )
  select cand.id, cand.display_name,
         least(1.0, (case when same_email then 0.9 else 0 end) + (case when same_phone then 0.7 else 0 end)
               + greatest(0, name_sim - 0.3) + (case when same_last_postal then 0.3 else 0 end))::real as score,
         array_remove(array[
           case when same_email then 'same email' end,
           case when same_phone then 'same phone' end,
           case when name_sim >= 0.99 then 'same name' when name_sim >= 0.6 then 'similar name' end,
           case when same_last_postal then 'same last name and ZIP' end
         ], null) as reasons
    from cand
   where same_email or same_phone or name_sim >= 0.6 or same_last_postal
   order by score desc
   limit 5;
end $$;

-- candidate_partners, same idea: indexed lookups instead of a scan of every record.
create or replace function app.candidate_partners(p_id uuid)
returns setof uuid
language sql stable security invoker as $$
  with me as (select * from constituents where id = p_id)
  select x.cid from (
    select eb.constituent_id as cid from me join constituent_emails ea on ea.constituent_id = me.id join constituent_emails eb on eb.org_id = me.org_id and eb.email = ea.email
    union select pb.constituent_id from me join constituent_phones pa on pa.constituent_id = me.id join constituent_phones pb on pb.org_id = me.org_id and pb.digits = pa.digits and length(pa.digits) >= 7
    union select o.id from me join constituents o on o.org_id = me.org_id and lower(o.display_name) % lower(me.display_name)
           where similarity(lower(o.display_name), lower(me.display_name)) >= 0.6
    union select xb.constituent_id from me join constituent_addresses xa on xa.constituent_id = me.id
           join constituent_addresses xb on xb.org_id = me.org_id and coalesce(xa.postal_code, '') <> ''
             and left(regexp_replace(coalesce(xb.postal_code, ''), '\s', '', 'g'), 5) = left(regexp_replace(coalesce(xa.postal_code, ''), '\s', '', 'g'), 5)
           join constituents o on o.id = xb.constituent_id and coalesce(me.last_name, '') <> '' and lower(coalesce(o.last_name, '')) = lower(me.last_name)
  ) x where x.cid <> p_id
$$;

-- Imports set app.defer_rescan for the length of their transaction and rescan once at the end.
create or replace function app.rescan_constituent() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_row jsonb := to_jsonb(coalesce(new, old));
begin
  if coalesce(current_setting('app.defer_rescan', true), '') = 'on' then return coalesce(new, old); end if;
  v_id := case when tg_table_name = 'constituents' then (v_row->>'id')::uuid else (v_row->>'constituent_id')::uuid end;
  if v_id is not null and exists (select 1 from constituents where id = v_id) then
    perform app.scan_duplicates_for(v_id);
  end if;
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------------
-- Import tables: owners and admins only.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['import_jobs', 'import_rows', 'import_mappings'] loop
    execute format('drop trigger if exists set_row_meta on %I', t);
    execute format('create trigger set_row_meta before insert or update on %I for each row execute function app.set_row_meta()', t);
    execute format('alter table %I enable row level security', t);
    foreach t in array array[t] loop
      execute format('drop policy if exists %1$s_all on %1$I', t);
      execute format('create policy %1$s_all on %1$I for all to authenticated using (app.has_role(org_id, ''{owner,admin}'')) with check (app.has_role(org_id, ''{owner,admin}''))', t);
    end loop;
  end loop;
end $$;
-- Jobs are audited; the thousands of staging rows are not (their results are).
drop trigger if exists audit on import_jobs;
create trigger audit after insert or update or delete on import_jobs for each row execute function app.audit_trigger();

-- ---------------------------------------------------------------------------
-- Matching people in a file against the organization.
-- ---------------------------------------------------------------------------
create or replace function app.match_import(p_job uuid, p_key text default null) returns void
language plpgsql security definer set search_path = public as $$
declare j import_jobs; r record; v_c jsonb; v_strong int; v_action import_row_action; v_match uuid;
begin
  select * into j from import_jobs where id = p_job;
  if j.id is null or not app.has_role(j.org_id, '{owner,admin}') then raise exception 'not allowed' using errcode = '42501'; end if;
  for r in
    select distinct on (person_key) person_key, mapped->'person' as p
      from import_rows
     where job_id = p_job and person_key is not null and action not in ('error', 'skip') and (p_key is null or person_key = p_key)
     order by person_key, row_number
  loop
    select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'displayName', d.display_name, 'score', d.score, 'reasons', d.reasons) order by d.score desc), '[]'),
           count(*) filter (where d.score >= 0.9)
      into v_c, v_strong
      from app.find_duplicates(j.org_id, coalesce(r.p->>'first_name', r.p->>'org_name'), r.p->>'last_name', r.p->>'email', r.p->>'phone', r.p->>'postal_code') d;
    v_match := null;
    if v_strong = 1 then
      v_action := 'match';
      v_match := (v_c->0->>'id')::uuid;
    elsif jsonb_array_length(v_c) > 0 then
      v_action := 'review';
    else
      v_action := 'create';
    end if;
    update import_rows set candidates = v_c, action = v_action, match_constituent_id = v_match
     where job_id = p_job and person_key = r.person_key and action not in ('error', 'skip');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Commit
-- ---------------------------------------------------------------------------
create or replace function app.commit_import(p_job uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  j import_jobs; v_claims jsonb := app.jwt(); v_uid uuid := app.uid();
  v_open int; v_batch uuid; v_default_fund uuid; v_name text; v_id uuid; v_choice text;
  v_thanked_before date; v_thanked int := 0;
  v_funds jsonb := '{}'; v_campaigns jsonb := '{}'; v_appeals jsonb := '{}';
  v_created jsonb := jsonb_build_object('funds', '[]'::jsonb, 'campaigns', '[]'::jsonb, 'appeals', '[]'::jsonb, 'tags', '[]'::jsonb);
  r record; g record; v_p jsonb; v_cid uuid; v_gid uuid; v_tag text; v_tag_id uuid;
  v_new_people uuid[] := '{}'; v_people_created int := 0; v_people_matched int := 0; v_gifts int := 0; v_total numeric := 0;
begin
  select * into j from import_jobs where id = p_job for update;
  if j.id is null then raise exception 'import not found' using errcode = 'P0002'; end if;
  if not (app.has_role(j.org_id, '{owner,admin}') and app.is_aal2()) then raise exception 'only an owner or admin with MFA can import' using errcode = '42501'; end if;
  if j.status <> 'ready' then raise exception 'this import is not ready to commit' using errcode = '22023'; end if;
  select count(*) into v_open from import_rows where job_id = p_job and action in ('error', 'review');
  if v_open > 0 then raise exception '% rows still need a decision', v_open using errcode = '23514'; end if;

  perform set_config('request.jwt.claims', (v_claims || jsonb_build_object('actor', 'system', 'org_id', j.org_id))::text, true);
  perform set_config('app.defer_rescan', 'on', true);

  -- Gift coding by name or code. Missing ones are created and remembered for rollback.
  for v_name in select distinct trim(mapped->'gift'->>'fund') from import_rows where job_id = p_job and action in ('create', 'match') and coalesce(trim(mapped->'gift'->>'fund'), '') <> '' loop
    -- The person's choice from the review step wins: an existing fund, or "new" to create one.
    v_choice := j.options->'coding'->'fund'->>v_name;
    v_id := null;
    if v_choice is not null and v_choice <> 'new' then
      select f.id into v_id from funds f where f.org_id = j.org_id and f.id = v_choice::uuid;
    elsif v_choice is null then
      select f.id into v_id from funds f where f.org_id = j.org_id and (lower(f.name) = lower(v_name) or lower(coalesce(f.code, '')) = lower(v_name)) limit 1;
    end if;
    if v_id is null then
      insert into funds (org_id, name) values (j.org_id, v_name) returning id into v_id;
      v_created := jsonb_set(v_created, '{funds}', (v_created->'funds') || to_jsonb(v_id));
    end if;
    v_funds := v_funds || jsonb_build_object(lower(v_name), v_id);
  end loop;
  for v_name in select distinct trim(mapped->'gift'->>'campaign') from import_rows where job_id = p_job and action in ('create', 'match') and coalesce(trim(mapped->'gift'->>'campaign'), '') <> '' loop
    -- The person's choice from the review step wins: an existing campaign, or "new" to create one.
    v_choice := j.options->'coding'->'campaign'->>v_name;
    v_id := null;
    if v_choice is not null and v_choice <> 'new' then
      select c.id into v_id from campaigns c where c.org_id = j.org_id and c.id = v_choice::uuid;
    elsif v_choice is null then
      select c.id into v_id from campaigns c where c.org_id = j.org_id and (lower(c.name) = lower(v_name) or lower(coalesce(c.code, '')) = lower(v_name)) limit 1;
    end if;
    if v_id is null then
      insert into campaigns (org_id, name) values (j.org_id, v_name) returning id into v_id;
      v_created := jsonb_set(v_created, '{campaigns}', (v_created->'campaigns') || to_jsonb(v_id));
    end if;
    v_campaigns := v_campaigns || jsonb_build_object(lower(v_name), v_id);
  end loop;
  for v_name in select distinct trim(mapped->'gift'->>'appeal') from import_rows where job_id = p_job and action in ('create', 'match') and coalesce(trim(mapped->'gift'->>'appeal'), '') <> '' loop
    -- The person's choice from the review step wins: an existing appeal, or "new" to create one.
    v_choice := j.options->'coding'->'appeal'->>v_name;
    v_id := null;
    if v_choice is not null and v_choice <> 'new' then
      select a.id into v_id from appeals a where a.org_id = j.org_id and a.id = v_choice::uuid;
    elsif v_choice is null then
      select a.id into v_id from appeals a where a.org_id = j.org_id and (lower(a.name) = lower(v_name) or lower(coalesce(a.code, '')) = lower(v_name)) limit 1;
    end if;
    if v_id is null then
      insert into appeals (org_id, name) values (j.org_id, v_name) returning id into v_id;
      v_created := jsonb_set(v_created, '{appeals}', (v_created->'appeals') || to_jsonb(v_id));
    end if;
    v_appeals := v_appeals || jsonb_build_object(lower(v_name), v_id);
  end loop;
  select nullif(gift_entry_standards->>'defaultFundId', '')::uuid into v_default_fund from organizations where id = j.org_id;
  -- Gifts dated before this were already thanked in the old system. They are recorded as
  -- thanked on their gift date, so they do not flood the thank-you queue.
  v_thanked_before := nullif(j.options->>'thankedBefore', '')::date;

  if exists (select 1 from import_rows where job_id = p_job and action in ('create', 'match') and jsonb_typeof(mapped->'gift') = 'object') then
    insert into batches (org_id, batch_date, description, status, posted_at, posted_by, notes)
    values (j.org_id, current_date, left('Import: ' || j.file_name, 200), 'posted', now(), v_uid, 'Created by an import. Rolling back the import removes it.')
    returning id into v_batch;
  end if;

  for r in
    select person_key, min(row_number) as first_row,
           (array_agg(action order by row_number))[1] as action,
           (array_agg(match_constituent_id order by row_number))[1] as match_id
      from import_rows where job_id = p_job and action in ('create', 'match')
     group by person_key order by min(row_number)
  loop
    if r.action = 'match' then
      select id into v_cid from constituents where id = r.match_id and org_id = j.org_id;
      if v_cid is null then raise exception 'a matched record no longer exists; re-check the duplicate review' using errcode = '23503'; end if;
      v_people_matched := v_people_matched + 1;
    else
      select mapped->'person' into v_p from import_rows where job_id = p_job and row_number = r.first_row;
      insert into constituents (org_id, type, prefix, first_name, last_name, suffix, preferred_name, org_name, notes, source,
                                do_not_contact, do_not_email, do_not_mail, do_not_call, custom_fields)
      values (j.org_id, coalesce(v_p->>'type', 'person')::constituent_type, v_p->>'prefix', v_p->>'first_name', v_p->>'last_name', v_p->>'suffix',
              v_p->>'preferred_name', v_p->>'org_name', v_p->>'notes', coalesce(v_p->>'source', 'import'),
              coalesce((v_p->>'do_not_contact')::boolean, false), coalesce((v_p->>'do_not_email')::boolean, false),
              coalesce((v_p->>'do_not_mail')::boolean, false), coalesce((v_p->>'do_not_call')::boolean, false),
              case when coalesce(v_p->>'legacy_id', '') <> '' then jsonb_build_object('legacyId', v_p->>'legacy_id') else '{}'::jsonb end)
      returning id into v_cid;
      if coalesce(v_p->>'email', '') <> '' then
        insert into constituent_emails (org_id, constituent_id, email, is_primary) values (j.org_id, v_cid, v_p->>'email', true);
      end if;
      if coalesce(v_p->>'phone', '') <> '' then
        insert into constituent_phones (org_id, constituent_id, phone, is_primary) values (j.org_id, v_cid, v_p->>'phone', true);
      end if;
      if coalesce(v_p->>'line1', '') <> '' or coalesce(v_p->>'city', '') <> '' or coalesce(v_p->>'postal_code', '') <> '' then
        insert into constituent_addresses (org_id, constituent_id, line1, line2, city, state, postal_code, country, is_primary)
        values (j.org_id, v_cid, v_p->>'line1', v_p->>'line2', v_p->>'city', v_p->>'state', v_p->>'postal_code', coalesce(nullif(v_p->>'country', ''), 'US'), true);
      end if;
      for v_tag in select trim(t) from jsonb_array_elements_text(coalesce(v_p->'tags', '[]'::jsonb)) t where trim(t) <> '' loop
        select id into v_tag_id from tags where org_id = j.org_id and lower(name) = lower(v_tag);
        if v_tag_id is null then
          insert into tags (org_id, name) values (j.org_id, v_tag) returning id into v_tag_id;
          v_created := jsonb_set(v_created, '{tags}', (v_created->'tags') || to_jsonb(v_tag_id));
        end if;
        insert into constituent_tags (org_id, constituent_id, tag_id) values (j.org_id, v_cid, v_tag_id) on conflict do nothing;
      end loop;
      update import_rows set created_constituent_id = v_cid where job_id = p_job and row_number = r.first_row;
      v_new_people := v_new_people || v_cid;
      v_people_created := v_people_created + 1;
    end if;

    for g in
      select row_number, mapped->'gift' as gift from import_rows
       where job_id = p_job and person_key = r.person_key and action in ('create', 'match') and jsonb_typeof(mapped->'gift') = 'object'
       order by row_number
    loop
      insert into gifts (org_id, constituent_id, batch_id, amount, gift_date, fund_id, campaign_id, appeal_id, payment_method, gift_type,
                         check_number, reference, notes, external_source, external_id, deductible_amount, posted_at, posted_by,
                         acknowledged_at, acknowledgment_method)
      values (j.org_id, v_cid, v_batch, (g.gift->>'amount')::numeric, (g.gift->>'gift_date')::date,
              coalesce((v_funds->>lower(coalesce(trim(g.gift->>'fund'), '')))::uuid, v_default_fund),
              (v_campaigns->>lower(coalesce(trim(g.gift->>'campaign'), '')))::uuid,
              (v_appeals->>lower(coalesce(trim(g.gift->>'appeal'), '')))::uuid,
              coalesce(g.gift->>'payment_method', 'other')::payment_method, 'one_time',
              g.gift->>'check_number', g.gift->>'reference', g.gift->>'notes', 'import', p_job::text || ':' || g.row_number,
              (g.gift->>'amount')::numeric, now(), v_uid,
              case when (g.gift->>'gift_date')::date < v_thanked_before then (g.gift->>'gift_date')::date::timestamptz end,
              case when (g.gift->>'gift_date')::date < v_thanked_before then 'before_import' end)
      returning id into v_gid;
      if (g.gift->>'gift_date')::date < v_thanked_before then v_thanked := v_thanked + 1; end if;
      update import_rows set created_gift_id = v_gid where job_id = p_job and row_number = g.row_number;
      v_gifts := v_gifts + 1;
      v_total := v_total + (g.gift->>'amount')::numeric;
    end loop;
  end loop;

  perform set_config('app.defer_rescan', 'off', true);
  for v_cid in select unnest(v_new_people) loop
    perform app.scan_duplicates_for(v_cid);
  end loop;

  update import_jobs
     set status = 'committed', committed_at = now(), batch_id = v_batch, created = v_created,
         summary = summary || jsonb_build_object('peopleCreated', v_people_created, 'peopleMatched', v_people_matched, 'gifts', v_gifts, 'giftTotal', v_total,
                   'thankedBefore', v_thanked,
                   'skipped', (select count(*) from import_rows where job_id = p_job and action = 'skip'),
                   'fundsCreated', jsonb_array_length(v_created->'funds'), 'campaignsCreated', jsonb_array_length(v_created->'campaigns'), 'appealsCreated', jsonb_array_length(v_created->'appeals'))
   where id = p_job;
  perform set_config('request.jwt.claims', v_claims::text, true);
  return (select summary from import_jobs where id = p_job);
end $$;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
create or replace function app.rollback_import(p_job uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  j import_jobs; v_claims jsonb := app.jwt(); v_kept uuid[]; v_people int; v_gifts int; v_coding int := 0; v_n int;
begin
  select * into j from import_jobs where id = p_job for update;
  if j.id is null then raise exception 'import not found' using errcode = 'P0002'; end if;
  if not (app.has_role(j.org_id, '{owner,admin}') and app.is_aal2()) then raise exception 'only an owner or admin with MFA can roll back an import' using errcode = '42501'; end if;
  if j.status <> 'committed' then raise exception 'only a committed import can be rolled back' using errcode = '22023'; end if;

  perform set_config('request.jwt.claims', (v_claims || jsonb_build_object('actor', 'system', 'org_id', j.org_id))::text, true);

  with d as (delete from gifts where id in (select created_gift_id from import_rows where job_id = p_job and created_gift_id is not null) returning 1)
  select count(*) into v_gifts from d;
  if j.batch_id is not null then
    delete from batches b where b.id = j.batch_id and not exists (select 1 from gifts g where g.batch_id = b.id);
  end if;

  -- People the import created are removed unless something outside the import now uses them.
  select coalesce(array_agg(c.id), '{}') into v_kept
    from constituents c
   where c.id in (select created_constituent_id from import_rows where job_id = p_job and created_constituent_id is not null)
     and (exists (select 1 from gifts g where g.constituent_id = c.id)
          or exists (select 1 from interactions i where i.constituent_id = c.id)
          or exists (select 1 from relationships r where r.from_constituent_id = c.id or r.to_constituent_id = c.id));
  with d as (
    delete from constituents
     where id in (select created_constituent_id from import_rows where job_id = p_job and created_constituent_id is not null)
       and not (id = any(v_kept))
    returning 1)
  select count(*) into v_people from d;

  with d as (delete from funds f where f.id in (select (jsonb_array_elements_text(j.created->'funds'))::uuid) and not exists (select 1 from gifts g where g.fund_id = f.id) returning 1)
  select count(*) into v_n from d; v_coding := v_coding + v_n;
  with d as (delete from appeals a where a.id in (select (jsonb_array_elements_text(j.created->'appeals'))::uuid) and not exists (select 1 from gifts g where g.appeal_id = a.id) returning 1)
  select count(*) into v_n from d; v_coding := v_coding + v_n;
  with d as (delete from campaigns c where c.id in (select (jsonb_array_elements_text(j.created->'campaigns'))::uuid) and not exists (select 1 from gifts g where g.campaign_id = c.id) and not exists (select 1 from appeals a where a.campaign_id = c.id) returning 1)
  select count(*) into v_n from d; v_coding := v_coding + v_n;
  delete from tags t where t.id in (select (jsonb_array_elements_text(coalesce(j.created->'tags', '[]')))::uuid) and not exists (select 1 from constituent_tags ct where ct.tag_id = t.id);

  update import_jobs
     set status = 'rolled_back', rolled_back_at = now(),
         summary = summary || jsonb_build_object('rolledBack', jsonb_build_object('gifts', v_gifts, 'people', v_people, 'coding', v_coding, 'keptPeople', to_jsonb(v_kept)))
   where id = p_job;
  perform set_config('request.jwt.claims', v_claims::text, true);
  return (select summary from import_jobs where id = p_job);
end $$;

grant execute on function app.match_import(uuid, text), app.commit_import(uuid), app.rollback_import(uuid) to authenticated;
