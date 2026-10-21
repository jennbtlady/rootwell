-- Phase 2: duplicate scanning, merge with undo, data health. Idempotent.

do $$
declare t text;
begin
  foreach t in array array['duplicate_candidates', 'merge_history'] loop
    execute format('drop trigger if exists set_row_meta on %I', t);
    execute format('create trigger set_row_meta before insert or update on %I for each row execute function app.set_row_meta()', t);
    execute format('drop trigger if exists audit on %I', t);
    execute format('create trigger audit after insert or update or delete on %I for each row execute function app.audit_trigger()', t);
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %1$s_select on %1$I', t);
    execute format('create policy %1$s_select on %1$I for select to authenticated using (app.has_role(org_id, ''{owner,admin,staff}''))', t);
  end loop;
end $$;

-- Staff may mark a pair as not a duplicate. Everything else goes through functions.
drop policy if exists duplicate_candidates_update on duplicate_candidates;
create policy duplicate_candidates_update on duplicate_candidates for update to authenticated
  using (app.has_role(org_id, '{owner,admin,staff}'))
  with check (app.has_role(org_id, '{owner,admin,staff}') and status in ('open', 'not_duplicate'));

-- ---------------------------------------------------------------------------
-- Scoring one pair. Same rules as app.find_duplicates(), applied to two records.
-- ---------------------------------------------------------------------------
create or replace function app.score_pair(p_a uuid, p_b uuid)
returns table (score real, reasons text[])
language sql stable security invoker as $$
  with a as (select * from constituents where id = p_a), b as (select * from constituents where id = p_b),
  f as (
    select
      exists (select 1 from constituent_emails ea join constituent_emails eb on eb.email = ea.email where ea.constituent_id = p_a and eb.constituent_id = p_b) as same_email,
      exists (select 1 from constituent_phones pa join constituent_phones pb on pb.digits = pa.digits and length(pa.digits) >= 7 where pa.constituent_id = p_a and pb.constituent_id = p_b) as same_phone,
      similarity(lower((select display_name from a)), lower((select display_name from b))) as name_sim,
      (lower(coalesce((select last_name from a), '')) <> '' and lower(coalesce((select last_name from a), '')) = lower(coalesce((select last_name from b), ''))
        and exists (select 1 from constituent_addresses xa join constituent_addresses xb
                      on left(regexp_replace(coalesce(xb.postal_code, ''), '\s', '', 'g'), 5) = left(regexp_replace(coalesce(xa.postal_code, ''), '\s', '', 'g'), 5)
                     where xa.constituent_id = p_a and xb.constituent_id = p_b and coalesce(xa.postal_code, '') <> '')) as same_last_postal
  )
  select least(1.0, (case when same_email then 0.9 else 0 end) + (case when same_phone then 0.7 else 0 end)
               + greatest(0, name_sim - 0.3) + (case when same_last_postal then 0.3 else 0 end))::real,
         array_remove(array[
           case when same_email then 'same email' end,
           case when same_phone then 'same phone' end,
           case when name_sim >= 0.99 then 'same name' when name_sim >= 0.6 then 'similar name' end,
           case when same_last_postal then 'same last name and ZIP' end
         ], null)
    from f
   where same_email or same_phone or name_sim >= 0.6 or same_last_postal
$$;

-- Candidate pairs for one constituent, found through indexes and name blocking.
create or replace function app.candidate_partners(p_id uuid)
returns setof uuid
language sql stable security invoker as $$
  with me as (select * from constituents where id = p_id)
  select distinct o.id
    from constituents o, me
   where o.org_id = me.org_id and o.id <> me.id and (
         exists (select 1 from constituent_emails ea join constituent_emails eb on eb.email = ea.email where ea.constituent_id = me.id and eb.constituent_id = o.id)
      or exists (select 1 from constituent_phones pa join constituent_phones pb on pb.digits = pa.digits and length(pa.digits) >= 7 where pa.constituent_id = me.id and pb.constituent_id = o.id)
      or ((lower(coalesce(o.last_name, '')) = lower(coalesce(me.last_name, '')) and coalesce(me.last_name, '') <> '')
          or left(lower(o.sort_name), 3) = left(lower(me.sort_name), 3))
         and similarity(lower(o.display_name), lower(me.display_name)) >= 0.6
      or (lower(coalesce(o.last_name, '')) = lower(coalesce(me.last_name, '')) and coalesce(me.last_name, '') <> ''
          and exists (select 1 from constituent_addresses xa join constituent_addresses xb
                        on left(regexp_replace(coalesce(xb.postal_code, ''), '\s', '', 'g'), 5) = left(regexp_replace(coalesce(xa.postal_code, ''), '\s', '', 'g'), 5)
                       where xa.constituent_id = me.id and xb.constituent_id = o.id and coalesce(xa.postal_code, '') <> ''))
   )
$$;

-- Upserts open candidates for one constituent. Pairs already marked not_duplicate stay.
create or replace function app.scan_duplicates_for(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_n int := 0; r record; s record;
begin
  select org_id into v_org from constituents where id = p_id;
  if v_org is null then return 0; end if;
  for r in select * from app.candidate_partners(p_id) as x(id) loop
    select * into s from app.score_pair(p_id, r.id);
    if s.score is null then continue; end if;
    insert into duplicate_candidates (org_id, a_id, b_id, score, reasons)
    values (v_org, least(p_id, r.id), greatest(p_id, r.id), s.score, s.reasons)
    on conflict (org_id, a_id, b_id) do update
      set score = excluded.score, reasons = excluded.reasons
      where duplicate_candidates.status = 'open';
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Whole-org scan. Returns the number of open candidates afterwards.
create or replace function app.scan_duplicates(p_org uuid) returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_n int;
begin
  if not app.has_role(p_org, '{owner,admin,staff}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  for r in select id from constituents where org_id = p_org loop
    perform app.scan_duplicates_for(r.id);
  end loop;
  -- Drop open candidates whose pair no longer scores (contact details were fixed).
  delete from duplicate_candidates d
   where d.org_id = p_org and d.status = 'open'
     and not exists (select 1 from app.score_pair(d.a_id, d.b_id));
  select count(*) into v_n from duplicate_candidates where org_id = p_org and status = 'open';
  return v_n;
end $$;

-- Keep the queue current as records are created or their contact points change.
create or replace function app.rescan_constituent() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_row jsonb := to_jsonb(coalesce(new, old));
begin
  -- Read through jsonb: plpgsql will not compile a reference to a column the table lacks.
  v_id := case when tg_table_name = 'constituents' then (v_row->>'id')::uuid else (v_row->>'constituent_id')::uuid end;
  if v_id is not null and exists (select 1 from constituents where id = v_id) then
    perform app.scan_duplicates_for(v_id);
  end if;
  return coalesce(new, old);
end $$;
do $$
declare t text;
begin
  foreach t in array array['constituents', 'constituent_emails', 'constituent_phones', 'constituent_addresses'] loop
    execute format('drop trigger if exists rescan_duplicates on %I', t);
    execute format('create trigger rescan_duplicates after insert or update on %I for each row execute function app.rescan_constituent()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Merge and undo
-- ---------------------------------------------------------------------------
create or replace function app.merge_constituents(p_survivor uuid, p_merged uuid, p_decisions jsonb default '{}'::jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_claims jsonb := app.jwt(); v_uid uuid := app.uid(); v_merge uuid;
  v_merged constituents; v_survivor constituents;
  v_snapshot jsonb; v_field text;
  v_moved_gifts uuid[]; v_moved_interactions uuid[]; v_moved_rel uuid[]; v_moved_plans uuid[]; v_moved_pledges uuid[];
  v_moved_emails uuid[]; v_moved_phones uuid[]; v_moved_addresses uuid[]; v_added_tags uuid[];
  v_dropped jsonb;
begin
  select * into v_survivor from constituents where id = p_survivor;
  select * into v_merged from constituents where id = p_merged;
  if v_survivor.id is null or v_merged.id is null then raise exception 'constituent not found' using errcode = 'P0002'; end if;
  if v_survivor.org_id <> v_merged.org_id then raise exception 'different organizations' using errcode = '23503'; end if;
  if p_survivor = p_merged then raise exception 'cannot merge a record with itself' using errcode = '22023'; end if;
  v_org := v_survivor.org_id;
  if not (app.has_role(v_org, '{owner,admin}') and app.is_aal2()) then
    raise exception 'only an owner or admin with MFA can merge' using errcode = '42501';
  end if;

  -- Snapshot before anything moves.
  v_snapshot := jsonb_build_object(
    'merged', to_jsonb(v_merged),
    'survivor_before', to_jsonb(v_survivor),
    'merged_children', jsonb_build_object(
      'emails', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from constituent_emails e where e.constituent_id = p_merged),
      'phones', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from constituent_phones p where p.constituent_id = p_merged),
      'addresses', (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from constituent_addresses a where a.constituent_id = p_merged),
      'tags', (select coalesce(jsonb_agg(ct.tag_id), '[]') from constituent_tags ct where ct.constituent_id = p_merged),
      'relationships', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from relationships r where r.from_constituent_id = p_merged or r.to_constituent_id = p_merged)
    )
  );

  perform set_config('request.jwt.claims', (v_claims || jsonb_build_object('actor', 'system', 'org_id', v_org))::text, true);

  -- Field decisions: 'b' means take the merged record's value.
  for v_field in select jsonb_object_keys(p_decisions) loop
    if p_decisions->>v_field = 'b' and v_field in ('prefix','first_name','middle_name','last_name','suffix','preferred_name','org_name','type','source','notes',
                                                   'do_not_contact','do_not_email','do_not_mail','do_not_call','deceased','deceased_on','assigned_to','custom_fields') then
      execute format('update constituents set %I = $1.%I where id = $2', v_field, v_field) using v_merged, p_survivor;
    end if;
  end loop;

  -- Money and history always move.
  with m as (update gifts set constituent_id = p_survivor where constituent_id = p_merged returning id) select coalesce(array_agg(id), '{}') into v_moved_gifts from m;
  with m as (update interactions set constituent_id = p_survivor where constituent_id = p_merged returning id) select coalesce(array_agg(id), '{}') into v_moved_interactions from m;
  with m as (update recurring_plans set constituent_id = p_survivor where constituent_id = p_merged returning id) select coalesce(array_agg(id), '{}') into v_moved_plans from m;
  with m as (update pledges set constituent_id = p_survivor where constituent_id = p_merged returning id) select coalesce(array_agg(id), '{}') into v_moved_pledges from m;

  -- Relationships: drop those that would point at the survivor itself or repeat one it has.
  delete from relationships r where (r.from_constituent_id = p_merged and r.to_constituent_id = p_survivor) or (r.to_constituent_id = p_merged and r.from_constituent_id = p_survivor);
  delete from relationships r where r.from_constituent_id = p_merged and exists (select 1 from relationships s where s.from_constituent_id = p_survivor and s.to_constituent_id = r.to_constituent_id and s.type = r.type);
  delete from relationships r where r.to_constituent_id = p_merged and exists (select 1 from relationships s where s.to_constituent_id = p_survivor and s.from_constituent_id = r.from_constituent_id and s.type = r.type);
  with m as (update relationships set from_constituent_id = p_survivor where from_constituent_id = p_merged returning id),
       n as (update relationships set to_constituent_id = p_survivor where to_constituent_id = p_merged returning id)
  select coalesce(array_agg(id), '{}') into v_moved_rel from (select id from m union all select id from n) x;

  -- Contact points: move the ones the survivor does not already have; repeats are dropped.
  v_dropped := jsonb_build_object(
    'emails', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from constituent_emails e where e.constituent_id = p_merged and exists (select 1 from constituent_emails s where s.constituent_id = p_survivor and s.email = e.email)),
    'phones', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from constituent_phones p where p.constituent_id = p_merged and exists (select 1 from constituent_phones s where s.constituent_id = p_survivor and s.digits = p.digits)),
    'addresses', (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from constituent_addresses a where a.constituent_id = p_merged and exists (select 1 from constituent_addresses s where s.constituent_id = p_survivor and lower(coalesce(s.line1,'')) = lower(coalesce(a.line1,'')) and left(coalesce(s.postal_code,''),5) = left(coalesce(a.postal_code,''),5)))
  );
  delete from constituent_emails e where e.constituent_id = p_merged and exists (select 1 from constituent_emails s where s.constituent_id = p_survivor and s.email = e.email);
  delete from constituent_phones p where p.constituent_id = p_merged and exists (select 1 from constituent_phones s where s.constituent_id = p_survivor and s.digits = p.digits);
  delete from constituent_addresses a where a.constituent_id = p_merged and exists (select 1 from constituent_addresses s where s.constituent_id = p_survivor and lower(coalesce(s.line1,'')) = lower(coalesce(a.line1,'')) and left(coalesce(s.postal_code,''),5) = left(coalesce(a.postal_code,''),5));
  with m as (update constituent_emails set constituent_id = p_survivor, is_primary = (is_primary and not exists (select 1 from constituent_emails s where s.constituent_id = p_survivor and s.is_primary)) where constituent_id = p_merged returning id) select coalesce(array_agg(id), '{}') into v_moved_emails from m;
  with m as (update constituent_phones set constituent_id = p_survivor, is_primary = (is_primary and not exists (select 1 from constituent_phones s where s.constituent_id = p_survivor and s.is_primary)) where constituent_id = p_merged returning id) select coalesce(array_agg(id), '{}') into v_moved_phones from m;
  with m as (update constituent_addresses set constituent_id = p_survivor, is_primary = (is_primary and not exists (select 1 from constituent_addresses s where s.constituent_id = p_survivor and s.is_primary)) where constituent_id = p_merged returning id) select coalesce(array_agg(id), '{}') into v_moved_addresses from m;
  with m as (insert into constituent_tags (org_id, constituent_id, tag_id) select org_id, p_survivor, tag_id from constituent_tags where constituent_id = p_merged on conflict do nothing returning tag_id)
  select coalesce(array_agg(tag_id), '{}') into v_added_tags from m;
  delete from constituent_tags where constituent_id = p_merged;

  -- Candidate rows that point at the merged record go with it (the foreign key cascades
  -- when it is deleted below). merge_history is the lasting record of the pair.

  -- The merged record goes away. The audit trigger records the delete; add a merge row too.
  delete from constituents where id = p_merged;
  insert into audit_log (org_id, actor_id, actor_kind, table_name, row_id, action, before, after)
  values (v_org, v_uid, 'user', 'constituents', p_survivor, 'merge', to_jsonb(v_merged), (select to_jsonb(c) from constituents c where c.id = p_survivor));

  v_snapshot := v_snapshot || jsonb_build_object(
    'moved', jsonb_build_object('gifts', to_jsonb(v_moved_gifts), 'interactions', to_jsonb(v_moved_interactions), 'relationships', to_jsonb(v_moved_rel),
                                'recurring_plans', to_jsonb(v_moved_plans), 'pledges', to_jsonb(v_moved_pledges),
                                'emails', to_jsonb(v_moved_emails), 'phones', to_jsonb(v_moved_phones), 'addresses', to_jsonb(v_moved_addresses), 'tags', to_jsonb(v_added_tags)),
    'dropped', v_dropped);

  insert into merge_history (org_id, surviving_id, merged_id, merged_display_name, decisions, snapshot, reversible_until)
  values (v_org, p_survivor, p_merged, v_merged.display_name, p_decisions, v_snapshot, now() + interval '30 days')
  returning id into v_merge;

  perform set_config('request.jwt.claims', v_claims::text, true);
  return v_merge;
end $$;

create or replace function app.unmerge(p_merge uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_claims jsonb := app.jwt(); v_uid uuid := app.uid();
  m merge_history; s jsonb; r jsonb; v_field text; v_before jsonb;
begin
  select * into m from merge_history where id = p_merge;
  if m.id is null then raise exception 'merge not found' using errcode = 'P0002'; end if;
  if not (app.has_role(m.org_id, '{owner,admin}') and app.is_aal2()) then
    raise exception 'only an owner or admin with MFA can undo a merge' using errcode = '42501';
  end if;
  if m.reversed_at is not null then raise exception 'already undone' using errcode = '22023'; end if;
  if m.reversible_until < now() then raise exception 'this merge can no longer be undone' using errcode = '22023'; end if;
  if not exists (select 1 from constituents where id = m.surviving_id) then raise exception 'the surviving record no longer exists' using errcode = '22023'; end if;
  s := m.snapshot;

  perform set_config('request.jwt.claims', (v_claims || jsonb_build_object('actor', 'system', 'org_id', m.org_id))::text, true);

  -- Bring the merged record back with its original id and fields.
  insert into constituents select * from jsonb_populate_record(null::constituents, s->'merged');

  -- Survivor fields back to how they were.
  v_before := s->'survivor_before';
  for v_field in select unnest(array['prefix','first_name','middle_name','last_name','suffix','preferred_name','org_name','type','source','notes',
                                     'do_not_contact','do_not_email','do_not_mail','do_not_call','deceased','deceased_on','assigned_to','custom_fields']) loop
    execute format('update constituents set %I = $1.%I where id = $2', v_field, v_field) using jsonb_populate_record(null::constituents, v_before), m.surviving_id;
  end loop;

  -- Moved rows go back by id.
  update gifts set constituent_id = m.merged_id where id in (select (jsonb_array_elements_text(s->'moved'->'gifts'))::uuid);
  update interactions set constituent_id = m.merged_id where id in (select (jsonb_array_elements_text(s->'moved'->'interactions'))::uuid);
  update recurring_plans set constituent_id = m.merged_id where id in (select (jsonb_array_elements_text(s->'moved'->'recurring_plans'))::uuid);
  update pledges set constituent_id = m.merged_id where id in (select (jsonb_array_elements_text(s->'moved'->'pledges'))::uuid);
  update constituent_emails set constituent_id = m.merged_id where id in (select (jsonb_array_elements_text(s->'moved'->'emails'))::uuid);
  update constituent_phones set constituent_id = m.merged_id where id in (select (jsonb_array_elements_text(s->'moved'->'phones'))::uuid);
  update constituent_addresses set constituent_id = m.merged_id where id in (select (jsonb_array_elements_text(s->'moved'->'addresses'))::uuid);
  delete from constituent_tags where constituent_id = m.surviving_id and tag_id in (select (jsonb_array_elements_text(s->'moved'->'tags'))::uuid);

  -- Relationships: moved ones were rewritten in place; restore every snapshotted row.
  delete from relationships where id in (select (jsonb_array_elements_text(s->'moved'->'relationships'))::uuid);
  for r in select * from jsonb_array_elements(s->'merged_children'->'relationships') loop
    insert into relationships select * from jsonb_populate_record(null::relationships, r) on conflict (id) do nothing;
  end loop;
  -- Primary flags and dropped repeats come back from the snapshot too.
  for r in select * from jsonb_array_elements(s->'merged_children'->'emails') loop
    insert into constituent_emails select * from jsonb_populate_record(null::constituent_emails, r)
    on conflict (id) do update set is_primary = excluded.is_primary, constituent_id = excluded.constituent_id;
  end loop;
  for r in select * from jsonb_array_elements(s->'merged_children'->'phones') loop
    insert into constituent_phones select * from jsonb_populate_record(null::constituent_phones, r)
    on conflict (id) do update set is_primary = excluded.is_primary, constituent_id = excluded.constituent_id;
  end loop;
  for r in select * from jsonb_array_elements(s->'merged_children'->'addresses') loop
    insert into constituent_addresses select * from jsonb_populate_record(null::constituent_addresses, r)
    on conflict (id) do update set is_primary = excluded.is_primary, constituent_id = excluded.constituent_id;
  end loop;
  insert into constituent_tags (org_id, constituent_id, tag_id)
  select m.org_id, m.merged_id, (jsonb_array_elements_text(s->'merged_children'->'tags'))::uuid on conflict do nothing;

  update merge_history set reversed_at = now(), reversed_by = v_uid where id = p_merge;
  insert into audit_log (org_id, actor_id, actor_kind, table_name, row_id, action, before, after)
  values (m.org_id, v_uid, 'user', 'constituents', m.merged_id, 'unmerge', null, s->'merged');

  perform set_config('request.jwt.claims', v_claims::text, true);
  perform app.scan_duplicates_for(m.merged_id);
end $$;

-- ---------------------------------------------------------------------------
-- Data health
-- ---------------------------------------------------------------------------
create or replace function app.data_health(p_org uuid) returns jsonb
language sql stable security invoker as $$
  select jsonb_build_object(
    'openDuplicates', (select count(*) from duplicate_candidates where org_id = p_org and status = 'open'),
    'missingEmail', (select count(*) from constituents c where c.org_id = p_org and not c.deceased and not exists (select 1 from constituent_emails e where e.constituent_id = c.id)),
    'missingAddress', (select count(*) from constituents c where c.org_id = p_org and not c.deceased and not exists (select 1 from constituent_addresses a where a.constituent_id = c.id and coalesce(a.line1, '') <> '')),
    'giftsMissingFund', (select count(*) from gifts g where g.org_id = p_org and g.fund_id is null),
    'unacknowledged14d', (select count(*) from gifts g where g.org_id = p_org and g.posted_at is not null and g.acknowledged_at is null and g.gift_type <> 'soft_credit' and g.gift_date < current_date - 14),
    'stale36m', (select count(*) from constituents c where c.org_id = p_org and not c.deceased
                   and not exists (select 1 from gifts g where g.constituent_id = c.id and g.gift_date >= current_date - interval '36 months')
                   and not exists (select 1 from interactions i where i.constituent_id = c.id and i.occurred_on >= current_date - interval '36 months')),
    'constituents', (select count(*) from constituents where org_id = p_org),
    'recentMerges', (select count(*) from merge_history where org_id = p_org and reversed_at is null and reversible_until > now())
  )
$$;

grant execute on function app.score_pair(uuid, uuid), app.candidate_partners(uuid), app.scan_duplicates_for(uuid), app.scan_duplicates(uuid),
  app.merge_constituents(uuid, uuid, jsonb), app.unmerge(uuid), app.data_health(uuid) to authenticated;
