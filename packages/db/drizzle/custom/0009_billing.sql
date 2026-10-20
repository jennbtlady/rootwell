-- Phase 6: trials, billing state, and read-only access for lapsed accounts. Idempotent.

-- New organizations start a 30-day trial.
create or replace function app.create_organization(
  p_name text,
  p_fiscal_year_start_month int default 1,
  p_timezone text default 'America/New_York'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_uid uuid := app.uid();
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into organizations (name, fiscal_year_start_month, timezone, subscription_status, trial_ends_at)
  values (p_name, p_fiscal_year_start_month, p_timezone, 'trialing', now() + interval '30 days')
  returning id into v_org;
  insert into org_memberships (org_id, user_id, role, status, accepted_at)
  values (v_org, v_uid, 'owner', 'active', now());
  return v_org;
end $$;

-- Organizations made before trials existed get a trial from today.
update organizations set trial_ends_at = now() + interval '30 days'
 where subscription_status = 'trialing' and trial_ends_at is null and not sample_org_enabled;

-- Only billing (the system actor) changes billing columns or the sample flag. Owners and
-- admins may edit their organization's name and settings, but a direct database call must
-- not be able to mark an unpaid account as paid, or turn a real account into a sample.
create or replace function app.guard_billing_columns() returns trigger
language plpgsql as $$
begin
  if app.is_system() or current_user not in ('authenticated', 'anon') then return new; end if;
  if new.subscription_status is distinct from old.subscription_status
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.read_only_until is distinct from old.read_only_until
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.sample_org_enabled is distinct from old.sample_org_enabled then
    raise exception 'billing fields are changed by billing only' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_billing_columns on organizations;
create trigger guard_billing_columns before update on organizations for each row execute function app.guard_billing_columns();

-- Can this organization change its data right now?
--   The sample organization: always.
--   Active or past due (Stripe is retrying a card): yes.
--   Trialing: until the trial ends.
--   Anything else (canceled, unpaid, trial over): read only.
create or replace function app.org_writable(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select o.sample_org_enabled
        or o.subscription_status in ('active', 'past_due')
        or (o.subscription_status = 'trialing' and (o.trial_ends_at is null or o.trial_ends_at > now()))
      from organizations o where o.id = p_org
  ), true)
$$;

-- Read only is enforced on every table of donor and gift data with restrictive policies,
-- which are ANDed with the existing ones. Reads are untouched. The system actor is exempt
-- so a Stripe payment made before the lapse is still recorded. Membership, ownership
-- transfer, board links, integrations, dashboard snapshots, the audit log and the
-- webhook log stay writable so the account can be handed over, exported, and restarted.
do $$
declare t text;
begin
  foreach t in array array[
    'acknowledgment_templates', 'acknowledgments', 'appeals', 'batches', 'campaigns',
    'constituent_addresses', 'constituent_emails', 'constituent_phones', 'constituent_tags', 'constituents',
    'donation_pages', 'duplicate_candidates', 'funds', 'gifts', 'import_jobs', 'import_mappings', 'import_rows',
    'interactions', 'merge_history', 'pledges', 'recurring_plans', 'relationships', 'tags'
  ] loop
    execute format('drop policy if exists %1$s_writable_insert on %1$I', t);
    execute format('create policy %1$s_writable_insert on %1$I as restrictive for insert to authenticated with check (app.is_system() or app.org_writable(org_id))', t);
    execute format('drop policy if exists %1$s_writable_update on %1$I', t);
    execute format('create policy %1$s_writable_update on %1$I as restrictive for update to authenticated using (app.is_system() or app.org_writable(org_id)) with check (app.is_system() or app.org_writable(org_id))', t);
    execute format('drop policy if exists %1$s_writable_delete on %1$I', t);
    execute format('create policy %1$s_writable_delete on %1$I as restrictive for delete to authenticated using (app.is_system() or app.org_writable(org_id))', t);
  end loop;
end $$;

-- The public giving page stops offering Stripe when the organization is read only.
create or replace function app.public_donation_page(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'orgId', p.org_id, 'orgName', o.name, 'title', p.title, 'intro', p.intro, 'thankYou', p.thank_you,
    'amounts', p.amounts, 'allowMonthly', p.allow_monthly, 'offerCoverFees', p.offer_cover_fees, 'campaignId', p.campaign_id,
    'funds', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by array_position(p.fund_ids, f.id)) from funds f where f.id = any(p.fund_ids) and f.active and f.org_id = p.org_id), '[]'),
    'stripeAccount', case when app.org_writable(p.org_id) then (select i.account_id from integrations i where i.org_id = p.org_id and i.provider = 'stripe' and i.status = 'connected') end,
    'sample', o.sample_org_enabled
  )
  from donation_pages p join organizations o on o.id = p.org_id
  where p.slug = lower(p_slug) and p.active
$$;
