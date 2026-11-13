-- Fundraising Phase 2: refunds, tributes, sponsor-an-animal, receipts. Idempotent.
-- Rollback notes are in docs/fundraising/phase-2.md.

-- Money is positive. A refund is a second, negative entry that points at the gift it
-- reverses (the original gift is never changed), so totals net out on their own.
alter table gifts drop constraint if exists gifts_amount_positive;
alter table gifts drop constraint if exists gifts_amount_sign;
alter table gifts add constraint gifts_amount_sign check (
  (gift_type = 'refund' and amount < 0 and reverses_gift_id is not null)
  or (gift_type <> 'refund' and amount > 0 and reverses_gift_id is null));

-- Row meta and audit on the new tables.
do $$
declare t text;
begin
  foreach t in array array['gift_tributes', 'sponsor_animals'] loop
    execute format('drop trigger if exists set_row_meta on %I', t);
    execute format('create trigger set_row_meta before insert or update on %I for each row execute function app.set_row_meta()', t);
    execute format('drop trigger if exists audit on %I', t);
    execute format('create trigger audit after insert or update or delete on %I for each row execute function app.audit_trigger()', t);
  end loop;
end $$;

-- Linked rows must belong to the same organization. Optional links are checked when set.
drop trigger if exists check_org_gift_id on gift_tributes;
create trigger check_org_gift_id before insert or update on gift_tributes for each row execute function app.check_child_org('gifts', 'gift_id');
drop trigger if exists check_org_fund_id on sponsor_animals;
create trigger check_org_fund_id before insert or update on sponsor_animals for each row when (new.fund_id is not null) execute function app.check_child_org('funds', 'fund_id');
drop trigger if exists check_org_sponsor_animal_id on gifts;
create trigger check_org_sponsor_animal_id before insert or update on gifts for each row when (new.sponsor_animal_id is not null) execute function app.check_child_org('sponsor_animals', 'sponsor_animal_id');
drop trigger if exists check_org_reverses_gift_id on gifts;
create trigger check_org_reverses_gift_id before insert or update on gifts for each row when (new.reverses_gift_id is not null) execute function app.check_child_org('gifts', 'reverses_gift_id');
drop trigger if exists check_org_sponsor_animal_id on recurring_plans;
create trigger check_org_sponsor_animal_id before insert or update on recurring_plans for each row when (new.sponsor_animal_id is not null) execute function app.check_child_org('sponsor_animals', 'sponsor_animal_id');

-- Tributes follow gifts: staff read and write, owners and admins delete. Board viewers see none.
alter table gift_tributes enable row level security;
drop policy if exists gift_tributes_select on gift_tributes;
create policy gift_tributes_select on gift_tributes for select to authenticated using (app.has_role(org_id, '{owner,admin,staff}'));
drop policy if exists gift_tributes_insert on gift_tributes;
create policy gift_tributes_insert on gift_tributes for insert to authenticated with check (app.has_role(org_id, '{owner,admin,staff}'));
drop policy if exists gift_tributes_update on gift_tributes;
create policy gift_tributes_update on gift_tributes for update to authenticated using (app.has_role(org_id, '{owner,admin,staff}')) with check (app.has_role(org_id, '{owner,admin,staff}'));
drop policy if exists gift_tributes_delete on gift_tributes;
create policy gift_tributes_delete on gift_tributes for delete to authenticated using (app.has_role(org_id, '{owner,admin}'));

-- Animals follow giving pages: staff read, owners and admins change.
alter table sponsor_animals enable row level security;
drop policy if exists sponsor_animals_select on sponsor_animals;
create policy sponsor_animals_select on sponsor_animals for select to authenticated using (app.has_role(org_id, '{owner,admin,staff}'));
drop policy if exists sponsor_animals_write on sponsor_animals;
create policy sponsor_animals_write on sponsor_animals for all to authenticated using (app.has_role(org_id, '{owner,admin}')) with check (app.has_role(org_id, '{owner,admin}'));

-- A posted gift is locked. Its animal and the gift it reverses are part of what is locked.
-- Same as 0003 otherwise.
create or replace function app.protect_posted_gift() returns trigger
language plpgsql as $$
begin
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
       or new.sponsor_animal_id is distinct from old.sponsor_animal_id or new.reverses_gift_id is distinct from old.reverses_gift_id
       or new.posted_at is distinct from old.posted_at or new.posted_by is distinct from old.posted_by then
      raise exception 'posted gifts cannot be changed' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'INSERT' and new.posted_at is not null and app.actor() <> 'system' then
    raise exception 'gifts are posted through their batch' using errcode = '42501';
  end if;
  return new;
end $$;

-- The public giving page. Replaces the 0017 version and adds tributes, the message box and
-- the animals the page shows (only shown ones, in the page's order). Rollback: re-run 0017.
create or replace function app.public_donation_page(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'orgId', p.org_id, 'orgName', o.name, 'title', p.title, 'intro', p.intro, 'thankYou', p.thank_you,
    'amounts', p.amounts, 'allowMonthly', p.allow_monthly, 'offerCoverFees', p.offer_cover_fees, 'campaignId', p.campaign_id,
    'allowTribute', p.allow_tribute, 'allowMessage', p.allow_message,
    'funds', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by array_position(p.fund_ids, f.id)) from funds f where f.id = any(p.fund_ids) and f.active and f.org_id = p.org_id), '[]'),
    'animals', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'description', a.description, 'photoPath', a.photo_path) order by array_position(p.animal_ids, a.id)) from sponsor_animals a where a.id = any(p.animal_ids) and a.active and a.org_id = p.org_id), '[]'),
    'stripeAccount', case when app.org_writable(p.org_id) then (select i.account_id from integrations i where i.org_id = p.org_id and i.provider = 'stripe' and i.status = 'connected') end,
    'sample', o.sample_org_enabled,
    'branding', o.branding,
    'logoPath', o.logo_path
  )
  from donation_pages p join organizations o on o.id = p.org_id
  where p.slug = lower(p_slug) and p.active
    and exists (select 1 from organization_modules m where m.org_id = p.org_id and m.module = 'donations')
$$;

-- The dashboard (0007), with refunds: dollar totals net out refund entries; donor and gift
-- counts, first and last gift dates and gift sizes leave them out. Rollback: re-run 0007.
create or replace function app.compute_dashboard(p_org uuid, p_as_of date default current_date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_start int; v_fy date; v_ytd_end date := p_as_of; v_prior_start date; v_prior_end date;
  r1_start date; r1_end date; r2_start date; r2_end date; v jsonb;
begin
  select fiscal_year_start_month into v_start from organizations where id = p_org;
  if v_start is null then return null; end if;
  v_fy := app.fiscal_year_start(p_as_of, v_start);
  v_prior_start := (v_fy - interval '1 year')::date;
  v_prior_end := (p_as_of - interval '1 year')::date;
  r1_start := (v_fy - interval '2 years')::date; r1_end := (v_fy - interval '1 year')::date;  -- earlier completed year [start, end)
  r2_start := r1_end; r2_end := v_fy;                                                        -- later completed year

  with cg as (
    select g.id, g.constituent_id, g.amount, g.gift_date, g.fund_id, g.campaign_id
      from gifts g
     where g.org_id = p_org and g.posted_at is not null and g.gift_type not in ('soft_credit', 'pledge', 'refund') and g.gift_date <= p_as_of
  ),
  -- Money in: gifts plus refund entries, which are negative. Dollar totals use this; donor
  -- and gift counts use cg, so a refund never counts as a gift or makes someone a donor.
  mg as (
    select g.id, g.constituent_id, g.amount, g.gift_date, g.fund_id, g.campaign_id
      from gifts g
     where g.org_id = p_org and g.posted_at is not null and g.gift_type not in ('soft_credit', 'pledge') and g.gift_date <= p_as_of
  ),
  ytd_m as (select * from mg where gift_date between v_fy and v_ytd_end),
  pytd_m as (select * from mg where gift_date between v_prior_start and v_prior_end),
  firsts as (select constituent_id, min(gift_date) as first_gift, max(gift_date) as last_gift from cg group by constituent_id),
  ytd as (select * from cg where gift_date between v_fy and v_ytd_end),
  pytd as (select * from cg where gift_date between v_prior_start and v_prior_end),
  y1 as (select distinct constituent_id from cg where gift_date >= r1_start and gift_date < r1_end),
  y2 as (select distinct constituent_id from cg where gift_date >= r2_start and gift_date < r2_end),
  y1_new as (select y1.constituent_id from y1 join firsts f using (constituent_id) where f.first_gift >= r1_start),
  y1_repeat as (select y1.constituent_id from y1 join firsts f using (constituent_id) where f.first_gift < r1_start)
  select jsonb_build_object(
    'asOf', p_as_of,
    'fiscalYearStart', v_fy,
    'priorPeriod', jsonb_build_object('start', v_prior_start, 'end', v_prior_end),
    'retentionPeriod', jsonb_build_object('earlierStart', r1_start, 'laterStart', r2_start, 'laterEnd', (r2_end - 1)),
    'donorsYtd', (select count(distinct constituent_id) from ytd),
    'donorsPriorYtd', (select count(distinct constituent_id) from pytd),
    'dollarsYtd', (select coalesce(sum(amount), 0) from ytd_m),
    'dollarsPriorYtd', (select coalesce(sum(amount), 0) from pytd_m),
    'giftsYtd', (select count(*) from ytd),
    'averageGiftYtd', (select coalesce(round(avg(amount), 2), 0) from ytd),
    'medianGiftYtd', (select coalesce(round((percentile_cont(0.5) within group (order by amount))::numeric, 2), 0) from ytd),
    'newDonorsYtd', (select count(*) from firsts where first_gift between v_fy and v_ytd_end),
    'repeatDonorsYtd', (select count(distinct y.constituent_id) from ytd y join firsts f using (constituent_id) where f.first_gift < v_fy),
    'retention', jsonb_build_object(
      'overall', jsonb_build_object('base', (select count(*) from y1), 'retained', (select count(*) from y1 join y2 using (constituent_id))),
      'firstTime', jsonb_build_object('base', (select count(*) from y1_new), 'retained', (select count(*) from y1_new join y2 using (constituent_id))),
      'repeat', jsonb_build_object('base', (select count(*) from y1_repeat), 'retained', (select count(*) from y1_repeat join y2 using (constituent_id)))
    ),
    'byFund', (select coalesce(jsonb_agg(x order by x.total desc), '[]') from (
      select coalesce(f.name, 'No fund') as name, sum(y.amount) as total, count(*) filter (where y.amount > 0) as gifts from ytd_m y left join funds f on f.id = y.fund_id group by 1) x),
    'byCampaign', (select coalesce(jsonb_agg(x order by x.total desc), '[]') from (
      select coalesce(c.name, 'No campaign') as name, sum(y.amount) as total, count(*) filter (where y.amount > 0) as gifts from ytd_m y left join campaigns c on c.id = y.campaign_id group by 1) x),
    'byMonth', (select coalesce(jsonb_agg(x order by x.month_index), '[]') from (
      select m as month_index, to_char((v_fy + (m || ' months')::interval), 'Mon') as label,
             (select coalesce(sum(amount), 0) from mg where gift_date >= (v_fy + (m || ' months')::interval)::date and gift_date < (v_fy + ((m + 1) || ' months')::interval)::date and gift_date <= p_as_of) as current,
             -- For the small trend lines on the key numbers: donors, first-time donors and gifts each month this year.
             (select count(distinct constituent_id) from cg where gift_date >= (v_fy + (m || ' months')::interval)::date and gift_date < (v_fy + ((m + 1) || ' months')::interval)::date and gift_date <= p_as_of) as donors,
             (select count(*) from firsts where first_gift >= (v_fy + (m || ' months')::interval)::date and first_gift < (v_fy + ((m + 1) || ' months')::interval)::date and first_gift <= p_as_of) as new_donors,
             (select count(*) from cg where gift_date >= (v_fy + (m || ' months')::interval)::date and gift_date < (v_fy + ((m + 1) || ' months')::interval)::date and gift_date <= p_as_of) as gifts,
             (select coalesce(sum(amount), 0) from mg where gift_date >= (v_prior_start + (m || ' months')::interval)::date and gift_date < (v_prior_start + ((m + 1) || ' months')::interval)::date) as prior
        from generate_series(0, 11) m) x),
    'topGifts', (select coalesce(jsonb_agg(x order by x.amount desc, x.date desc), '[]') from (
      select y.id as "giftId", y.constituent_id as "constituentId", c.display_name as name, y.amount, y.gift_date as date, f.name as fund
        from ytd y join constituents c on c.id = y.constituent_id left join funds f on f.id = y.fund_id
       order by y.amount desc, y.gift_date desc limit 10) x),
    -- Active campaigns with a goal: raised so far, counting gifts inside the campaign's dates.
    'campaignGoals', (select coalesce(jsonb_agg(x order by x.ends_on nulls last, x.name), '[]') from (
      select c.name, c.goal_amount as goal, c.starts_on, c.ends_on,
             (select coalesce(sum(mg.amount), 0) from mg where mg.campaign_id = c.id
                 and (c.starts_on is null or mg.gift_date >= c.starts_on) and (c.ends_on is null or mg.gift_date <= c.ends_on)) as raised
        from campaigns c
       where c.org_id = p_org and c.active and c.goal_amount is not null and c.goal_amount > 0
         and (c.ends_on is null or c.ends_on >= (p_as_of - interval '30 days')::date)) x),
    -- This year's gifts by size: how much of the total the largest gifts carry.
    'giftBands', (select coalesce(jsonb_agg(x order by x.min desc), '[]') from (
      select b.label, b.min, count(y.id) as gifts, coalesce(sum(y.amount), 0) as total
        from (values ('$1,000 or more', 1000::numeric, null::numeric), ('$250 to $999', 250, 1000), ('$100 to $249', 100, 250), ('Under $100', 0, 100)) b(label, min, max)
        left join ytd y on y.amount >= b.min and (b.max is null or y.amount < b.max)
       group by b.label, b.min) x),
    -- LYBUNT: gave last fiscal year, not yet this one.
    'lybunt', (select count(distinct p.constituent_id) from cg p
                where p.gift_date >= v_prior_start and p.gift_date < v_fy
                  and not exists (select 1 from ytd y where y.constituent_id = p.constituent_id)),
    'lapsed', jsonb_build_object(
      'count', (select count(*) from firsts where last_gift <= (p_as_of - interval '13 months')::date and last_gift > (p_as_of - interval '15 months')::date),
      'from', (p_as_of - interval '15 months')::date, 'to', (p_as_of - interval '13 months')::date)
  ) into v;
  return v;
end $$;
revoke all on function app.compute_dashboard(uuid, date) from public;
