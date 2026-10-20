-- Phase 0 task 7: invitations, sample organization. Idempotent.

-- ---------------------------------------------------------------------------
-- Invitations. Supabase Auth sends the invite email and owns the token; this
-- side records who was invited to which org with which role.
-- ---------------------------------------------------------------------------
-- Dropped first because Postgres cannot change a function's return type in place.
drop function if exists app.invite_member(uuid, text, org_role);
create function app.invite_member(p_org uuid, p_email text, p_role org_role)
returns table (membership_id uuid, membership_status membership_status)
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_user uuid;
  v_id uuid;
  v_status membership_status;
begin
  if not (app.has_role(p_org, '{owner,admin}') and app.is_aal2()) then
    raise exception 'only owners and admins can invite, with MFA' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'ownership moves only through transfer' using errcode = '22023';
  end if;

  select id into v_user from auth.users where lower(email) = v_email limit 1;

  if v_user is not null then
    if exists (select 1 from org_memberships m where m.org_id = p_org and m.user_id = v_user) then
      raise exception 'already a member' using errcode = '23505';
    end if;
    -- An existing account joins right away. There is nothing to confirm by email.
    insert into org_memberships (org_id, user_id, role, status, invited_email, invited_by, accepted_at)
    values (p_org, v_user, p_role, 'active', v_email, app.uid(), now())
    returning id into v_id;
    v_status := 'active';
  else
    if exists (select 1 from org_memberships m where m.org_id = p_org and m.status = 'invited' and lower(m.invited_email) = v_email) then
      raise exception 'already invited' using errcode = '23505';
    end if;
    insert into org_memberships (org_id, role, status, invited_email, invited_by, invite_expires_at)
    values (p_org, p_role, 'invited', v_email, app.uid(), now() + interval '7 days')
    returning id into v_id;
    v_status := 'invited';
  end if;

  return query select v_id, v_status;
end $$;

-- When an invited person signs in for the first time, their memberships go live.
create or replace function app.activate_memberships_on_sign_in() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update org_memberships
     set status = 'active', accepted_at = coalesce(accepted_at, now())
   where user_id = new.id and status = 'invited';
  return new;
end $$;

drop trigger if exists on_auth_user_signed_in on auth.users;
create trigger on_auth_user_signed_in after update of last_sign_in_at on auth.users
  for each row when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function app.activate_memberships_on_sign_in();

-- ---------------------------------------------------------------------------
-- Sample organization: one per person, clearly labeled, removable.
-- ---------------------------------------------------------------------------
create or replace function app.seed_sample_data(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Phase 1 adds funds, campaigns, constituents and gifts here. Keeping the seed in
  -- the database means the app and `pnpm db:seed` share one path.
  return;
end $$;

create or replace function app.create_sample_org() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_uid uuid := app.uid();
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;

  select o.id into v_org
    from organizations o
    join org_memberships m on m.org_id = o.id
   where o.sample_org_enabled and m.user_id = v_uid and m.role = 'owner' and m.status = 'active'
   limit 1;
  if v_org is not null then return v_org; end if;

  insert into organizations (name, ein, fiscal_year_start_month, timezone, sample_org_enabled, address)
  values ('Sample Food Pantry (demo data)', '12-3456789', 7, 'America/New_York', true,
          '{"line1":"100 Main Street","city":"Springfield","state":"IL","postalCode":"62701","country":"US"}')
  returning id into v_org;

  insert into org_memberships (org_id, user_id, role, status, accepted_at)
  values (v_org, v_uid, 'owner', 'active', now());

  perform app.seed_sample_data(v_org);
  return v_org;
end $$;

create or replace function app.delete_sample_org(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- No MFA needed: the sample holds no real data, and its owner may not have set MFA up.
  if not app.has_role(p_org, '{owner}') then
    raise exception 'only the owner can remove it' using errcode = '42501';
  end if;
  if not exists (select 1 from organizations where id = p_org and sample_org_enabled) then
    raise exception 'only the sample organization can be removed here' using errcode = '42501';
  end if;
  delete from organizations where id = p_org;
end $$;

grant execute on function app.invite_member(uuid, text, org_role) to authenticated;
grant execute on function app.create_sample_org() to authenticated;
grant execute on function app.delete_sample_org(uuid) to authenticated;
