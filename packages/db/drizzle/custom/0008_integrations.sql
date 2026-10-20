-- Phase 5: integrations, webhooks, donation pages. Idempotent.

do $$
declare t text;
begin
  foreach t in array array['integrations', 'donation_pages'] loop
    execute format('drop trigger if exists set_row_meta on %I', t);
    execute format('create trigger set_row_meta before insert or update on %I for each row execute function app.set_row_meta()', t);
    execute format('drop trigger if exists audit on %I', t);
    execute format('create trigger audit after insert or update or delete on %I for each row execute function app.audit_trigger()', t);
  end loop;
end $$;

alter table integrations enable row level security;
alter table webhook_events enable row level security;
alter table donation_pages enable row level security;

-- Staff see whether integrations are healthy. Only owners and admins (with MFA) change
-- them. Nobody signed in can read the encrypted credentials column directly.
drop policy if exists integrations_select on integrations;
create policy integrations_select on integrations for select to authenticated using (app.has_role(org_id, '{owner,admin,staff}'));
drop policy if exists integrations_write on integrations;
create policy integrations_write on integrations for all to authenticated
  using (app.has_role(org_id, '{owner,admin}') and app.is_aal2()) with check (app.has_role(org_id, '{owner,admin}') and app.is_aal2());
revoke select on integrations from authenticated;
grant select (id, org_id, provider, status, account_id, config, last_sync_at, last_sync_summary, last_error, last_error_at, created_at, updated_at, created_by, updated_by)
  on integrations to authenticated;
grant insert, update, delete on integrations to authenticated;

-- The server reads credentials through this, as an owner or admin, or as the system actor.
create or replace function app.integration_credentials(p_org uuid, p_provider integration_provider) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not (app.has_role(p_org, '{owner,admin}') or (app.is_system() and app.system_org_id() = p_org)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return (select credentials from integrations where org_id = p_org and provider = p_provider);
end $$;

-- Webhooks: written by the system actor for one org; readable by staff for Data Health.
drop policy if exists webhook_events_select on webhook_events;
create policy webhook_events_select on webhook_events for select to authenticated using (app.has_role(org_id, '{owner,admin,staff}'));
drop policy if exists webhook_events_write on webhook_events;
create policy webhook_events_write on webhook_events for all to authenticated using (app.is_system() and org_id = app.system_org_id()) with check (app.is_system() and org_id = app.system_org_id());

-- A verified webhook names a connected account; this finds its organization. Returns an id
-- only, and the caller has already checked the provider's signature.
create or replace function app.org_for_integration_account(p_provider integration_provider, p_account text) returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from integrations where provider = p_provider and account_id = p_account and status <> 'disconnected' limit 1
$$;

-- Donation pages
drop policy if exists donation_pages_select on donation_pages;
create policy donation_pages_select on donation_pages for select to authenticated using (app.has_role(org_id, '{owner,admin,staff}'));
drop policy if exists donation_pages_write on donation_pages;
create policy donation_pages_write on donation_pages for all to authenticated using (app.has_role(org_id, '{owner,admin}')) with check (app.has_role(org_id, '{owner,admin}'));
alter table donation_pages drop constraint if exists donation_pages_slug_format;
alter table donation_pages add constraint donation_pages_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$');

-- What the public giving page may know: the page, the org's name, the funds offered, and
-- whether Stripe is connected. Nothing about donors.
create or replace function app.public_donation_page(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'orgId', p.org_id, 'orgName', o.name, 'title', p.title, 'intro', p.intro, 'thankYou', p.thank_you,
    'amounts', p.amounts, 'allowMonthly', p.allow_monthly, 'offerCoverFees', p.offer_cover_fees, 'campaignId', p.campaign_id,
    'funds', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by array_position(p.fund_ids, f.id)) from funds f where f.id = any(p.fund_ids) and f.active and f.org_id = p.org_id), '[]'),
    'stripeAccount', (select i.account_id from integrations i where i.org_id = p.org_id and i.provider = 'stripe' and i.status = 'connected'),
    'sample', o.sample_org_enabled
  )
  from donation_pages p join organizations o on o.id = p.org_id
  where p.slug = lower(p_slug) and p.active
$$;

-- Owners and admins clear a webhook's "needs attention" flag after they have dealt with it
-- (for example, a refund). Only that one column changes.
create or replace function app.resolve_webhook_event(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from webhook_events where id = p_id;
  if v_org is null or not app.has_role(v_org, '{owner,admin}') then return false; end if;
  update webhook_events set needs_attention = false where id = p_id;
  return true;
end $$;
