-- The public giving page (fundraising Phase 1). Replaces the 0009 version and adds two things:
--   * the organization's branding and logo, so the page carries its brand;
--   * the Donations module check: an organization without it has no public giving pages.
-- Rollback: re-run the definition in 0009_billing.sql.
create or replace function app.public_donation_page(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'orgId', p.org_id, 'orgName', o.name, 'title', p.title, 'intro', p.intro, 'thankYou', p.thank_you,
    'amounts', p.amounts, 'allowMonthly', p.allow_monthly, 'offerCoverFees', p.offer_cover_fees, 'campaignId', p.campaign_id,
    'funds', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by array_position(p.fund_ids, f.id)) from funds f where f.id = any(p.fund_ids) and f.active and f.org_id = p.org_id), '[]'),
    'stripeAccount', case when app.org_writable(p.org_id) then (select i.account_id from integrations i where i.org_id = p.org_id and i.provider = 'stripe' and i.status = 'connected') end,
    'sample', o.sample_org_enabled,
    'branding', o.branding,
    'logoPath', o.logo_path
  )
  from donation_pages p join organizations o on o.id = p.org_id
  where p.slug = lower(p_slug) and p.active
    and exists (select 1 from organization_modules m where m.org_id = p.org_id and m.module = 'donations')
$$;
