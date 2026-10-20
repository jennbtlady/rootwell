-- Phase 0: identity helpers, row metadata, audit trail, RLS policies, org creation,
-- ownership transfer. Idempotent: safe to run on every migrate.

create extension if not exists pg_trgm;
create extension if not exists unaccent;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Identity. Everything below reads the JWT claims that Supabase (PostgREST) or
-- packages/db withRls() placed in request.jwt.claims.
-- ---------------------------------------------------------------------------
create or replace function app.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

create or replace function app.uid() returns uuid
language sql stable as $$
  select nullif(app.jwt()->>'sub', '')::uuid
$$;

create or replace function app.actor() returns text
language sql stable as $$
  select coalesce(app.jwt()->>'actor', 'user')
$$;

create or replace function app.is_system() returns boolean
language sql stable as $$
  select app.actor() = 'system'
$$;

create or replace function app.system_org_id() returns uuid
language sql stable as $$
  select case when app.is_system() then nullif(app.jwt()->>'org_id', '')::uuid end
$$;

-- MFA complete. Supabase sets aal to aal2 after a successful MFA challenge.
-- app.mfa_enforcement = 'off' is a transaction-local switch that withRls() sets only in
-- local development when MFA_ENFORCEMENT=off. Production never sets it.
create or replace function app.is_aal2() returns boolean
language sql stable as $$
  select app.is_system() or app.jwt()->>'aal' = 'aal2' or coalesce(current_setting('app.mfa_enforcement', true), '') = 'off'
$$;

-- Orgs the current identity may see. Security definer so the lookup itself is not
-- subject to the org_memberships policies (which would recurse).
create or replace function app.member_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from org_memberships
   where user_id = app.uid() and status = 'active'
  union
  select app.system_org_id() where app.is_system()
$$;

create or replace function app.has_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select (app.is_system() and app.system_org_id() = p_org)
      or exists (
        select 1 from org_memberships
         where org_id = p_org and user_id = app.uid()
           and status = 'active' and role::text = any(p_roles)
      )
$$;

revoke all on function app.member_org_ids() from public;
revoke all on function app.has_role(uuid, text[]) from public;
grant execute on function app.jwt(), app.uid(), app.actor(), app.is_system(), app.system_org_id(),
  app.is_aal2(), app.member_org_ids(), app.has_role(uuid, text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row metadata and audit triggers
-- ---------------------------------------------------------------------------
create or replace function app.set_row_meta() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(new.created_by, app.uid());
    new.updated_at := new.created_at;
    new.updated_by := new.created_by;
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := app.uid();
  end if;
  return new;
end $$;

-- Security definer because audit_log has no insert policy for anyone.
create or replace function app.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_org uuid;
  v_row uuid;
begin
  v_org := coalesce(v_new->>'org_id', v_old->>'org_id', v_new->>'id', v_old->>'id')::uuid;
  v_row := coalesce(v_new->>'id', v_old->>'id')::uuid;
  -- When an organization is deleted, its rows cascade away and the org no longer exists
  -- to reference. There is nothing left to audit against, so skip.
  if not exists (select 1 from organizations where id = v_org) then
    return coalesce(new, old);
  end if;
  insert into audit_log (org_id, actor_id, actor_kind, table_name, row_id, action, before, after)
  values (v_org, app.uid(), app.actor()::actor_kind, tg_table_name, v_row, lower(tg_op)::audit_action, v_old, v_new);
  return coalesce(new, old);
end $$;

-- Attach to every tenant table. Add a line here when a tenant table is created.
do $$
declare t text;
begin
  foreach t in array array['organizations', 'org_memberships'] loop
    execute format('drop trigger if exists set_row_meta on %I', t);
    execute format('create trigger set_row_meta before insert or update on %I for each row execute function app.set_row_meta()', t);
    execute format('drop trigger if exists audit on %I', t);
    execute format('create trigger audit after insert or update or delete on %I for each row execute function app.audit_trigger()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- profiles: mirror of auth.users, created on signup
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_id_auth_users_fk') then
    alter table profiles add constraint profiles_id_auth_users_fk
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;

create or replace function app.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do update set email = excluded.email;

  -- Claim any pending invitations sent to this email.
  update org_memberships
     set user_id = new.id
   where user_id is null and status = 'invited' and lower(invited_email) = lower(new.email);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table organizations   enable row level security;
alter table profiles        enable row level security;
alter table org_memberships enable row level security;
alter table audit_log       enable row level security;
alter table ownership_events enable row level security;

-- organizations
drop policy if exists organizations_select on organizations;
create policy organizations_select on organizations for select to authenticated
  using (id in (select app.member_org_ids()));

-- Insert goes through app.create_organization() so the owner membership is created in
-- the same statement. No direct insert policy.
drop policy if exists organizations_update on organizations;
create policy organizations_update on organizations for update to authenticated
  using (app.has_role(id, '{owner,admin}') and app.is_aal2())
  with check (app.has_role(id, '{owner,admin}') and app.is_aal2());

-- Deleting an org is an owner action handled by a future function (Phase 6: cancel and
-- export). No delete policy for now.

-- profiles: you can see yourself and people who share an org with you.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated
  using (
    id = app.uid()
    or exists (
      select 1 from org_memberships m
       where m.user_id = profiles.id and m.status = 'active'
         and m.org_id in (select app.member_org_ids())
    )
  );
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update to authenticated
  using (id = app.uid()) with check (id = app.uid());

-- org_memberships
drop policy if exists org_memberships_select on org_memberships;
create policy org_memberships_select on org_memberships for select to authenticated
  using (org_id in (select app.member_org_ids()));

-- Admins invite and manage non-owner members. Owner rows move only through
-- app.transfer_ownership(). MFA required.
drop policy if exists org_memberships_insert on org_memberships;
create policy org_memberships_insert on org_memberships for insert to authenticated
  with check (app.has_role(org_id, '{owner,admin}') and app.is_aal2() and role <> 'owner');

drop policy if exists org_memberships_update on org_memberships;
create policy org_memberships_update on org_memberships for update to authenticated
  using (app.has_role(org_id, '{owner,admin}') and app.is_aal2() and role <> 'owner')
  with check (app.has_role(org_id, '{owner,admin}') and app.is_aal2() and role <> 'owner');

drop policy if exists org_memberships_delete on org_memberships;
create policy org_memberships_delete on org_memberships for delete to authenticated
  using (app.has_role(org_id, '{owner,admin}') and app.is_aal2() and role <> 'owner');

-- audit_log: readable by staff and above, written only by the trigger.
drop policy if exists audit_log_select on audit_log;
create policy audit_log_select on audit_log for select to authenticated
  using (app.has_role(org_id, '{owner,admin,staff}'));

-- ownership_events: owner and admin can read. Written only by functions.
drop policy if exists ownership_events_select on ownership_events;
create policy ownership_events_select on ownership_events for select to authenticated
  using (app.has_role(org_id, '{owner,admin}'));

-- ---------------------------------------------------------------------------
-- Org creation and ownership transfer
-- ---------------------------------------------------------------------------
create or replace function app.create_organization(
  p_name text,
  p_fiscal_year_start_month int default 1,
  p_timezone text default 'America/New_York'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_uid uuid := app.uid();
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into organizations (name, fiscal_year_start_month, timezone)
  values (p_name, p_fiscal_year_start_month, p_timezone)
  returning id into v_org;
  insert into org_memberships (org_id, user_id, role, status, accepted_at)
  values (v_org, v_uid, 'owner', 'active', now());
  return v_org;
end $$;

-- The owner hands the org to an active member. Both memberships are updated in one
-- statement and the event is recorded.
create or replace function app.transfer_ownership(p_org uuid, p_to_user uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := app.uid();
begin
  if not (app.has_role(p_org, '{owner}') and app.is_aal2()) then
    raise exception 'only the owner can transfer ownership, with MFA' using errcode = '42501';
  end if;
  if not exists (select 1 from org_memberships where org_id = p_org and user_id = p_to_user and status = 'active') then
    raise exception 'the new owner must already be an active member' using errcode = '23503';
  end if;
  update org_memberships set role = 'admin' where org_id = p_org and user_id = v_uid and role = 'owner';
  update org_memberships set role = 'owner' where org_id = p_org and user_id = p_to_user;
  insert into ownership_events (org_id, kind, from_user_id, to_user_id, performed_by, reason)
  values (p_org, 'transfer', v_uid, p_to_user, v_uid, p_reason);
end $$;

-- Noble Maple support override, for when the owner is unreachable. Requires the
-- support actor claim, which only the support tooling can mint. Always audited.
create or replace function app.support_transfer_ownership(p_org uuid, p_to_user uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_from uuid;
begin
  if app.actor() <> 'support' or coalesce(p_reason, '') = '' then
    raise exception 'support override requires the support actor and a reason' using errcode = '42501';
  end if;
  select user_id into v_from from org_memberships where org_id = p_org and role = 'owner' limit 1;
  update org_memberships set role = 'admin' where org_id = p_org and role = 'owner';
  insert into org_memberships (org_id, user_id, role, status, accepted_at)
  values (p_org, p_to_user, 'owner', 'active', now())
  on conflict (org_id, user_id) do update set role = 'owner', status = 'active';
  insert into ownership_events (org_id, kind, from_user_id, to_user_id, performed_by, reason)
  values (p_org, 'support_override', v_from, p_to_user, app.uid(), p_reason);
end $$;

grant execute on function app.create_organization(text, int, text) to authenticated;
grant execute on function app.transfer_ownership(uuid, uuid, text) to authenticated;
grant execute on function app.support_transfer_ownership(uuid, uuid, text) to authenticated, service_role;
