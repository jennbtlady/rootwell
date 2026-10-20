-- Phase 1: constituents, coding, interactions, batches, gifts. Idempotent.

-- ---------------------------------------------------------------------------
-- Row metadata and audit triggers on every new tenant table.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'funds', 'campaigns', 'appeals',
    'constituents', 'constituent_emails', 'constituent_phones', 'constituent_addresses',
    'tags', 'relationships', 'interactions',
    'batches', 'gifts', 'recurring_plans', 'pledges'
  ] loop
    execute format('drop trigger if exists set_row_meta on %I', t);
    execute format('create trigger set_row_meta before insert or update on %I for each row execute function app.set_row_meta()', t);
    execute format('drop trigger if exists audit on %I', t);
    execute format('create trigger audit after insert or update or delete on %I for each row execute function app.audit_trigger()', t);
  end loop;
end $$;

-- constituent_tags has no updated_* columns and no uuid id; audit it by hand.
create or replace function app.audit_constituent_tag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Skip when the organization itself is being deleted (nothing left to reference).
  if not exists (select 1 from organizations where id = coalesce(new.org_id, old.org_id)) then
    return coalesce(new, old);
  end if;
  insert into audit_log (org_id, actor_id, actor_kind, table_name, row_id, action, before, after)
  values (coalesce(new.org_id, old.org_id), app.uid(), app.actor()::actor_kind, 'constituent_tags',
          coalesce(new.constituent_id, old.constituent_id), lower(tg_op)::audit_action,
          case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
drop trigger if exists audit on constituent_tags;
create trigger audit after insert or delete on constituent_tags for each row execute function app.audit_constituent_tag();
create or replace function app.set_created_meta() returns trigger
language plpgsql as $$
begin
  new.created_at := coalesce(new.created_at, now());
  new.created_by := coalesce(new.created_by, app.uid());
  return new;
end $$;
drop trigger if exists set_created_meta on constituent_tags;
create trigger set_created_meta before insert on constituent_tags for each row execute function app.set_created_meta();

-- ---------------------------------------------------------------------------
-- Names, normalized contact points, search indexes
-- ---------------------------------------------------------------------------
create or replace function app.set_constituent_names() returns trigger
language plpgsql as $$
declare v_first text := nullif(trim(coalesce(new.preferred_name, new.first_name, '')), '');
        v_last text := nullif(trim(coalesce(new.last_name, '')), '');
        v_org text := nullif(trim(coalesce(new.org_name, '')), '');
begin
  if new.type = 'person' then
    new.display_name := trim(concat_ws(' ', v_first, v_last));
    new.sort_name := trim(both ', ' from concat_ws(', ', v_last, v_first));
  else
    new.display_name := coalesce(v_org, trim(concat_ws(' ', v_first, v_last)));
    new.sort_name := new.display_name;
  end if;
  if new.display_name = '' then
    raise exception 'a constituent needs a name' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists set_names on constituents;
create trigger set_names before insert or update on constituents for each row execute function app.set_constituent_names();

create or replace function app.normalize_email() returns trigger
language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  return new;
end $$;
drop trigger if exists normalize_email on constituent_emails;
create trigger normalize_email before insert or update on constituent_emails for each row execute function app.normalize_email();

create or replace function app.normalize_phone() returns trigger
language plpgsql as $$
begin
  new.digits := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
  -- Drop a leading US country code so 1-555-... and 555-... match.
  if length(new.digits) = 11 and left(new.digits, 1) = '1' then new.digits := substr(new.digits, 2); end if;
  return new;
end $$;
drop trigger if exists normalize_phone on constituent_phones;
create trigger normalize_phone before insert or update on constituent_phones for each row execute function app.normalize_phone();

create index if not exists constituents_display_name_trgm on constituents using gin (display_name gin_trgm_ops);
create index if not exists constituent_emails_email_trgm on constituent_emails using gin (email gin_trgm_ops);

-- Only one primary per kind per constituent.
create unique index if not exists constituent_emails_primary_uq on constituent_emails (constituent_id) where is_primary;
create unique index if not exists constituent_phones_primary_uq on constituent_phones (constituent_id) where is_primary;
create unique index if not exists constituent_addresses_primary_uq on constituent_addresses (constituent_id) where is_primary;

-- A relationship cannot point at itself.
alter table relationships drop constraint if exists relationships_not_self;
alter table relationships add constraint relationships_not_self check (from_constituent_id <> to_constituent_id);

-- Money is positive.
alter table gifts drop constraint if exists gifts_amount_positive;
alter table gifts add constraint gifts_amount_positive check (amount > 0);

-- Child rows must belong to their parent's org. The policies already scope org_id, but
-- this stops a mismatched pair from ever being written.
create or replace function app.check_child_org() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  execute format('select org_id from %I where id = $1', tg_argv[0]) into v_org using (to_jsonb(new)->>tg_argv[1])::uuid;
  if v_org is null or v_org <> new.org_id then
    raise exception 'row belongs to a different organization' using errcode = '23503';
  end if;
  return new;
end $$;
do $$
declare r record;
begin
  for r in select * from (values
    ('constituent_emails', 'constituents', 'constituent_id'),
    ('constituent_phones', 'constituents', 'constituent_id'),
    ('constituent_addresses', 'constituents', 'constituent_id'),
    ('constituent_tags', 'constituents', 'constituent_id'),
    ('constituent_tags', 'tags', 'tag_id'),
    ('relationships', 'constituents', 'from_constituent_id'),
    ('relationships', 'constituents', 'to_constituent_id'),
    ('interactions', 'constituents', 'constituent_id'),
    ('gifts', 'constituents', 'constituent_id'),
    ('recurring_plans', 'constituents', 'constituent_id'),
    ('pledges', 'constituents', 'constituent_id')
  ) as v(child, parent, col) loop
    execute format('drop trigger if exists check_org_%s on %I', r.col, r.child);
    execute format('create trigger check_org_%s before insert or update on %I for each row execute function app.check_child_org(%L, %L)', r.col, r.child, r.parent, r.col);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS. Board viewers see none of these. Staff read and write. Owners and admins delete.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'funds', 'campaigns', 'appeals',
    'constituents', 'constituent_emails', 'constituent_phones', 'constituent_addresses',
    'tags', 'constituent_tags', 'relationships', 'interactions',
    'batches', 'gifts', 'recurring_plans', 'pledges'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %1$s_select on %1$I', t);
    execute format('create policy %1$s_select on %1$I for select to authenticated using (app.has_role(org_id, ''{owner,admin,staff}''))', t);
    execute format('drop policy if exists %1$s_insert on %1$I', t);
    execute format('create policy %1$s_insert on %1$I for insert to authenticated with check (app.has_role(org_id, ''{owner,admin,staff}''))', t);
    execute format('drop policy if exists %1$s_update on %1$I', t);
    execute format('create policy %1$s_update on %1$I for update to authenticated using (app.has_role(org_id, ''{owner,admin,staff}'')) with check (app.has_role(org_id, ''{owner,admin,staff}''))', t);
    execute format('drop policy if exists %1$s_delete on %1$I', t);
    execute format('create policy %1$s_delete on %1$I for delete to authenticated using (app.has_role(org_id, ''{owner,admin}''))', t);
  end loop;
end $$;

-- Staff may delete their own contact-point rows and tags on a constituent (routine edits).
drop policy if exists constituent_emails_delete on constituent_emails;
create policy constituent_emails_delete on constituent_emails for delete to authenticated using (app.has_role(org_id, '{owner,admin,staff}'));
drop policy if exists constituent_phones_delete on constituent_phones;
create policy constituent_phones_delete on constituent_phones for delete to authenticated using (app.has_role(org_id, '{owner,admin,staff}'));
drop policy if exists constituent_addresses_delete on constituent_addresses;
create policy constituent_addresses_delete on constituent_addresses for delete to authenticated using (app.has_role(org_id, '{owner,admin,staff}'));
drop policy if exists constituent_tags_delete on constituent_tags;
create policy constituent_tags_delete on constituent_tags for delete to authenticated using (app.has_role(org_id, '{owner,admin,staff}'));
drop policy if exists relationships_delete on relationships;
create policy relationships_delete on relationships for delete to authenticated using (app.has_role(org_id, '{owner,admin,staff}'));

-- ---------------------------------------------------------------------------
-- Posting. A posted gift is locked except for acknowledgment fields and notes.
-- ---------------------------------------------------------------------------
create or replace function app.protect_posted_gift() returns trigger
language plpgsql as $$
begin
  -- pg_trigger_depth() > 1 means a cascade (deleting the organization), not a direct edit.
  if old.posted_at is not null and app.actor() <> 'system' and pg_trigger_depth() <= 1 then
    if tg_op = 'DELETE' then
      raise exception 'posted gifts cannot be deleted' using errcode = '42501';
    end if;
    if new.amount is distinct from old.amount or new.gift_date is distinct from old.gift_date
       or new.constituent_id is distinct from old.constituent_id or new.fund_id is distinct from old.fund_id
       or new.campaign_id is distinct from old.campaign_id or new.appeal_id is distinct from old.appeal_id
       or new.payment_method is distinct from old.payment_method or new.gift_type is distinct from old.gift_type
       or new.check_number is distinct from old.check_number or new.batch_id is distinct from old.batch_id
       or new.fair_market_value is distinct from old.fair_market_value or new.deductible_amount is distinct from old.deductible_amount
       or new.posted_at is distinct from old.posted_at or new.posted_by is distinct from old.posted_by then
      raise exception 'posted gifts cannot be changed' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  -- Nobody posts a gift by editing it; only app.post_batch() does.
  if tg_op = 'INSERT' and new.posted_at is not null and app.actor() <> 'system' then
    raise exception 'gifts are posted through their batch' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists protect_posted on gifts;
create trigger protect_posted before update or delete on gifts for each row execute function app.protect_posted_gift();
drop trigger if exists protect_posted_insert on gifts;
create trigger protect_posted_insert before insert on gifts for each row execute function app.protect_posted_gift();

-- Gifts can only be added to open batches, and a posted batch cannot be reopened.
create or replace function app.protect_batch() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'batches' then
    if old.status = 'posted' and app.actor() <> 'system' and pg_trigger_depth() <= 1 then
      raise exception 'posted batches cannot be changed' using errcode = '42501';
    end if;
    if new.status = 'posted' and old.status = 'open' and app.actor() <> 'system' then
      raise exception 'batches are posted through app.post_batch()' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.batch_id is not null and (tg_op = 'INSERT' or new.batch_id is distinct from old.batch_id) and app.actor() <> 'system' then
    if exists (select 1 from batches b where b.id = new.batch_id and b.status <> 'open') then
      raise exception 'that batch is already posted' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_batch on batches;
create trigger protect_batch before update on batches for each row execute function app.protect_batch();
drop trigger if exists gift_batch_open on gifts;
create trigger gift_batch_open before insert or update on gifts for each row execute function app.protect_batch();

-- Posts a batch: owner or admin with MFA, totals must match if given, every gift gets
-- posted_at. Runs as a system actor inside so the locks above let it through.
create or replace function app.post_batch(p_batch uuid)
returns table (posted_count int, posted_total numeric)
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_status batch_status; v_expected_total numeric; v_expected_count int;
        v_count int; v_total numeric; v_claims jsonb; v_uid uuid := app.uid();
begin
  select org_id, status, expected_total, expected_count into v_org, v_status, v_expected_total, v_expected_count
    from batches where id = p_batch;
  if v_org is null then raise exception 'batch not found' using errcode = 'P0002'; end if;
  -- MFA is required to post real money. The sample organization is exempt so people can try it.
  if not (app.has_role(v_org, '{owner,admin}') and (app.is_aal2() or exists (select 1 from organizations o where o.id = v_org and o.sample_org_enabled))) then
    raise exception 'only an owner or admin with MFA can post a batch' using errcode = '42501';
  end if;
  if v_status <> 'open' then raise exception 'batch is already posted' using errcode = '42501'; end if;

  select count(*), coalesce(sum(amount), 0) into v_count, v_total from gifts where batch_id = p_batch;
  if v_count = 0 then raise exception 'batch has no gifts' using errcode = '22023'; end if;
  if v_expected_total is not null and v_expected_total <> v_total then
    raise exception 'batch total % does not match the expected total %', v_total, v_expected_total using errcode = '23514';
  end if;
  if v_expected_count is not null and v_expected_count <> v_count then
    raise exception 'batch has % gifts but % were expected', v_count, v_expected_count using errcode = '23514';
  end if;

  -- Switch to the system actor for the same org so the lock triggers allow the stamp,
  -- then restore the caller's claims so the audit rows name the real person.
  v_claims := app.jwt();
  perform set_config('request.jwt.claims', (v_claims || jsonb_build_object('actor', 'system', 'org_id', v_org))::text, true);
  update gifts set posted_at = now(), posted_by = v_uid where batch_id = p_batch;
  update batches set status = 'posted', posted_at = now(), posted_by = v_uid where id = p_batch;
  perform set_config('request.jwt.claims', v_claims::text, true);

  return query select v_count, v_total;
end $$;

-- ---------------------------------------------------------------------------
-- Search and duplicate scoring
-- ---------------------------------------------------------------------------
create or replace function app.search_constituents(p_org uuid, p_q text, p_limit int default 20)
returns table (id uuid, display_name text, sort_name text, type constituent_type, primary_email text, score real)
language sql stable security invoker as $$
  with q as (select lower(trim(p_q)) as q, regexp_replace(p_q, '\D', '', 'g') as digits)
  select c.id, c.display_name, c.sort_name, c.type,
         (select e.email from constituent_emails e where e.constituent_id = c.id order by e.is_primary desc, e.created_at limit 1),
         greatest(
           similarity(lower(c.display_name), q.q),
           case when exists (select 1 from constituent_emails e where e.constituent_id = c.id and e.email like q.q || '%') then 0.9 else 0 end,
           case when length(q.digits) >= 4 and exists (select 1 from constituent_phones p where p.constituent_id = c.id and p.digits like '%' || q.digits || '%') then 0.8 else 0 end,
           case when lower(c.display_name) like '%' || q.q || '%' then 0.7 else 0 end
         )::real as score
    from constituents c, q
   where c.org_id = p_org and length(q.q) > 0
     and (
       lower(c.display_name) % q.q
       or lower(c.display_name) like '%' || q.q || '%'
       or exists (select 1 from constituent_emails e where e.constituent_id = c.id and e.email like q.q || '%')
       or (length(q.digits) >= 4 and exists (select 1 from constituent_phones p where p.constituent_id = c.id and p.digits like '%' || q.digits || '%'))
     )
   order by score desc, c.sort_name
   limit p_limit
$$;

-- Scored possible duplicates for a person being entered. Reasons explain the score so
-- the form can say "same email" rather than just show a number.
create or replace function app.find_duplicates(
  p_org uuid, p_first text, p_last text, p_email text default null, p_phone text default null, p_postal text default null, p_exclude uuid default null
) returns table (id uuid, display_name text, score real, reasons text[])
language plpgsql stable security invoker as $$
declare v_name text := lower(trim(concat_ws(' ', p_first, p_last)));
        v_email text := lower(trim(coalesce(p_email, '')));
        v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
        v_postal text := left(regexp_replace(coalesce(p_postal, ''), '\s', '', 'g'), 5);
begin
  if length(v_digits) = 11 and left(v_digits, 1) = '1' then v_digits := substr(v_digits, 2); end if;
  return query
  with cand as (
    select c.id, c.display_name,
      (v_email <> '' and exists (select 1 from constituent_emails e where e.constituent_id = c.id and e.email = v_email)) as same_email,
      (length(v_digits) >= 7 and exists (select 1 from constituent_phones p where p.constituent_id = c.id and p.digits = v_digits)) as same_phone,
      similarity(lower(c.display_name), v_name) as name_sim,
      (v_postal <> '' and p_last is not null and lower(coalesce(c.last_name, '')) = lower(trim(p_last))
         and exists (select 1 from constituent_addresses a where a.constituent_id = c.id and left(regexp_replace(coalesce(a.postal_code, ''), '\s', '', 'g'), 5) = v_postal)) as same_last_postal
    from constituents c
    where c.org_id = p_org and (p_exclude is null or c.id <> p_exclude)
  )
  select cand.id, cand.display_name,
         least(1.0, (case when same_email then 0.9 else 0 end) + (case when same_phone then 0.7 else 0 end)
               + greatest(0, name_sim - 0.3) + (case when same_last_postal then 0.3 else 0 end))::real as score,
         array_remove(array[
           case when same_email then 'same email' end,
           case when same_phone then 'same phone' end,
           case when name_sim >= 0.6 then 'similar name' end,
           case when same_last_postal then 'same last name and ZIP' end
         ], null) as reasons
    from cand
   where same_email or same_phone or name_sim >= 0.6 or same_last_postal
   order by score desc
   limit 5;
end $$;

grant execute on function app.post_batch(uuid) to authenticated;
grant execute on function app.search_constituents(uuid, text, int) to authenticated;
grant execute on function app.find_duplicates(uuid, text, text, text, text, text, uuid) to authenticated;
