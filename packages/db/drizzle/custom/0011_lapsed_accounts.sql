-- Lapsed accounts: notices and deletion after 12 months with no activity (Jenn, 2026-10-20).
-- See docs/lapsed-accounts.md. Idempotent.
--
-- The rule, in one place:
--   An organization is "lapsed" when it is read only (app.org_writable is false) and is not
--   the sample organization.
--   Its quiet stretch starts at the later of: when it lapsed, and its last activity.
--   Activity is any active team member signing in or refreshing a session (Supabase's own
--   auth records) or using the API for that organization (organizations.last_activity_at).
--   It is deleted 12 months after the quiet stretch starts, and only after notices went to
--   the whole team at 60, 30, and 7 days, and at least 7 days after the last notice.

alter table deleted_organizations enable row level security;
-- No policies: nobody signed in reads or writes it. app.delete_lapsed_org() writes it.

-- Only billing and the scheduler change the lapse columns (extends 0009's guard).
create or replace function app.guard_billing_columns() returns trigger
language plpgsql as $$
begin
  if app.is_system() or app.actor() = 'scheduler' or current_user not in ('authenticated', 'anon') then return new; end if;
  if new.subscription_status is distinct from old.subscription_status
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.read_only_until is distinct from old.read_only_until
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.sample_org_enabled is distinct from old.sample_org_enabled
     or new.last_activity_at is distinct from old.last_activity_at
     or new.lapse_notices_sent is distinct from old.lapse_notices_sent
     or new.lapse_notices_for is distinct from old.lapse_notices_for
     or new.lapse_final_notice_at is distinct from old.lapse_final_notice_at then
    raise exception 'billing fields are changed by billing only' using errcode = '42501';
  end if;
  return new;
end $$;

-- Latest activity by anyone on the team.
create or replace function app.org_last_activity(p_org uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select greatest(
    o.created_at,
    o.last_activity_at,
    (select max(greatest(u.last_sign_in_at, s.last_session))
       from org_memberships m
       join auth.users u on u.id = m.user_id
       left join lateral (select max(greatest(x.refreshed_at, x.updated_at)) as last_session from auth.sessions x where x.user_id = u.id) s on true
      where m.org_id = o.id and m.status = 'active')
  )
  from organizations o where o.id = p_org
$$;

-- When the account became read only: the end of the trial, or 90 days before read_only_until
-- (billing sets read_only_until 90 days after a subscription ends). Null if it is not lapsed.
create or replace function app.org_lapsed_at(p_org uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select case
    when o.sample_org_enabled or app.org_writable(o.id) then null
    else coalesce(o.read_only_until - interval '90 days', o.trial_ends_at, o.created_at)
  end
  from organizations o where o.id = p_org
$$;

-- The day a lapsed organization will be deleted if nobody is active before then.
create or replace function app.org_delete_on(p_org uuid) returns date
language sql stable security definer set search_path = public as $$
  select (greatest(app.org_lapsed_at(p_org), app.org_last_activity(p_org)) + interval '12 months')::date
   where app.org_lapsed_at(p_org) is not null
$$;

-- A team member used the API for this organization. Cheap: writes at most once an hour, and
-- only while the organization is read only (that is the only time the clock matters).
create or replace function app.touch_org_activity(p_org uuid) returns void
language sql volatile security definer set search_path = public as $$
  update organizations set last_activity_at = now()
   where id = p_org
     and p_org in (select app.member_org_ids())
     and not app.is_system()
     and not app.org_writable(p_org)
     and (last_activity_at is null or last_activity_at < now() - interval '1 hour')
$$;

-- Scheduler only: lapsed organizations within 60 days of deletion, oldest first. New
-- activity since the last notices starts a fresh quiet stretch: the notices are cleared.
create or replace function app.lapsed_orgs_due() returns table (org_id uuid, name text, delete_on date, days_left int, notices_sent smallint[], final_notice_at timestamptz)
language plpgsql volatile security definer set search_path = public as $$
declare r record; v_start timestamptz;
begin
  if app.actor() is distinct from 'scheduler' then raise exception 'not allowed' using errcode = '42501'; end if;
  for r in select o.id from organizations o where not o.sample_org_enabled and not app.org_writable(o.id) loop
    v_start := greatest(app.org_lapsed_at(r.id), app.org_last_activity(r.id));
    update organizations o set lapse_notices_sent = '{}', lapse_notices_for = v_start, lapse_final_notice_at = null
     where o.id = r.id and o.lapse_notices_for is distinct from v_start;
  end loop;
  return query
    select o.id, o.name, app.org_delete_on(o.id), (app.org_delete_on(o.id) - current_date)::int, o.lapse_notices_sent, o.lapse_final_notice_at
      from organizations o
     where not o.sample_org_enabled and not app.org_writable(o.id)
       and app.org_delete_on(o.id) - current_date <= 60
     order by app.org_delete_on(o.id);
end $$;

-- Scheduler only: who gets the notice. The whole team: every active member.
create or replace function app.lapse_notice_recipients(p_org uuid) returns table (email text, full_name text)
language sql stable security definer set search_path = public as $$
  select coalesce(p.email, u.email), p.full_name
    from org_memberships m
    join auth.users u on u.id = m.user_id
    left join profiles p on p.id = m.user_id
   where m.org_id = p_org and m.status = 'active' and app.actor() = 'scheduler'
$$;

-- Scheduler only: note that notices went out. Notices for longer lead times are marked as
-- covered too, so a late run never sends 60 and 30 days at once.
create or replace function app.record_lapse_notice(p_org uuid, p_days smallint) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if app.actor() is distinct from 'scheduler' then raise exception 'not allowed' using errcode = '42501'; end if;
  update organizations
     set lapse_notices_sent = (select array_agg(distinct d order by d desc) from unnest(lapse_notices_sent || array(select x::smallint from unnest(array[60, 30, 7]) x where x >= p_days)) d),
         lapse_final_notice_at = now()
   where id = p_org;
end $$;

-- Scheduler only: delete one lapsed organization. Checks every condition again here, so a
-- bug in the job cannot delete an account that is in use, paid for, or not fully warned.
create or replace function app.delete_lapsed_org(p_org uuid) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare o organizations; v_delete date; v_members int;
begin
  if app.actor() is distinct from 'scheduler' then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into o from organizations where id = p_org for update;
  if o.id is null or o.sample_org_enabled or app.org_writable(p_org) then return false; end if;
  v_delete := app.org_delete_on(p_org);
  if v_delete is null or v_delete > current_date then return false; end if;
  if not (o.lapse_notices_sent @> array[60, 30, 7]::smallint[]) then return false; end if;
  if o.lapse_final_notice_at is null or o.lapse_final_notice_at > now() - interval '7 days' then return false; end if;
  select count(*) into v_members from org_memberships where org_id = p_org and status = 'active';
  insert into deleted_organizations (former_org_id, name, org_created_at, subscription_status, lapsed_at, last_activity_at, notices_sent, members_notified)
  values (o.id, o.name, o.created_at, o.subscription_status, app.org_lapsed_at(p_org), app.org_last_activity(p_org), o.lapse_notices_sent, v_members);
  delete from organizations where id = p_org;
  return true;
end $$;
