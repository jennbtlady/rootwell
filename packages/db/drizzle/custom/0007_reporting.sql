-- Phase 4: dashboard snapshots, board links, acknowledgments. Idempotent.

do $$
declare t text;
begin
  foreach t in array array['dashboard_snapshots', 'board_share_links', 'acknowledgment_templates', 'acknowledgments'] loop
    execute format('drop trigger if exists set_row_meta on %I', t);
    execute format('create trigger set_row_meta before insert or update on %I for each row execute function app.set_row_meta()', t);
    execute format('alter table %I enable row level security', t);
  end loop;
  foreach t in array array['board_share_links', 'acknowledgment_templates', 'acknowledgments'] loop
    execute format('drop trigger if exists audit on %I', t);
    execute format('create trigger audit after insert or update or delete on %I for each row execute function app.audit_trigger()', t);
  end loop;
end $$;

-- Board viewers read the dashboard and nothing else. Snapshots are written only by functions.
drop policy if exists dashboard_snapshots_select on dashboard_snapshots;
create policy dashboard_snapshots_select on dashboard_snapshots for select to authenticated
  using (app.has_role(org_id, '{owner,admin,staff,board_viewer}'));

drop policy if exists board_share_links_all on board_share_links;
create policy board_share_links_all on board_share_links for all to authenticated
  using (app.has_role(org_id, '{owner,admin}')) with check (app.has_role(org_id, '{owner,admin}'));

drop policy if exists acknowledgment_templates_select on acknowledgment_templates;
create policy acknowledgment_templates_select on acknowledgment_templates for select to authenticated using (app.has_role(org_id, '{owner,admin,staff}'));
drop policy if exists acknowledgment_templates_write on acknowledgment_templates;
create policy acknowledgment_templates_write on acknowledgment_templates for all to authenticated
  using (app.has_role(org_id, '{owner,admin}')) with check (app.has_role(org_id, '{owner,admin}'));

drop policy if exists acknowledgments_select on acknowledgments;
create policy acknowledgments_select on acknowledgments for select to authenticated using (app.has_role(org_id, '{owner,admin,staff}'));
drop policy if exists acknowledgments_insert on acknowledgments;
create policy acknowledgments_insert on acknowledgments for insert to authenticated with check (app.has_role(org_id, '{owner,admin,staff}'));

-- ---------------------------------------------------------------------------
-- Fiscal year helpers
-- ---------------------------------------------------------------------------
create or replace function app.fiscal_year_start(p_on date, p_start_month int) returns date
language sql immutable as $$
  select make_date(extract(year from p_on)::int - case when extract(month from p_on)::int < p_start_month then 1 else 0 end, p_start_month, 1)
$$;

-- ---------------------------------------------------------------------------
-- The dashboard, computed for one organization on one day. Definitions: docs/phase-4.md.
-- ---------------------------------------------------------------------------
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
     where g.org_id = p_org and g.posted_at is not null and g.gift_type not in ('soft_credit', 'pledge') and g.gift_date <= p_as_of
  ),
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
    'dollarsYtd', (select coalesce(sum(amount), 0) from ytd),
    'dollarsPriorYtd', (select coalesce(sum(amount), 0) from pytd),
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
      select coalesce(f.name, 'No fund') as name, sum(y.amount) as total, count(*) as gifts from ytd y left join funds f on f.id = y.fund_id group by 1) x),
    'byCampaign', (select coalesce(jsonb_agg(x order by x.total desc), '[]') from (
      select coalesce(c.name, 'No campaign') as name, sum(y.amount) as total, count(*) as gifts from ytd y left join campaigns c on c.id = y.campaign_id group by 1) x),
    'byMonth', (select coalesce(jsonb_agg(x order by x.month_index), '[]') from (
      select m as month_index, to_char((v_fy + (m || ' months')::interval), 'Mon') as label,
             (select coalesce(sum(amount), 0) from cg where gift_date >= (v_fy + (m || ' months')::interval)::date and gift_date < (v_fy + ((m + 1) || ' months')::interval)::date and gift_date <= p_as_of) as current,
             (select coalesce(sum(amount), 0) from cg where gift_date >= (v_prior_start + (m || ' months')::interval)::date and gift_date < (v_prior_start + ((m + 1) || ' months')::interval)::date) as prior
        from generate_series(0, 11) m) x),
    'topGifts', (select coalesce(jsonb_agg(x order by x.amount desc, x.date desc), '[]') from (
      select y.id as "giftId", y.constituent_id as "constituentId", c.display_name as name, y.amount, y.gift_date as date, f.name as fund
        from ytd y join constituents c on c.id = y.constituent_id left join funds f on f.id = y.fund_id
       order by y.amount desc, y.gift_date desc limit 10) x),
    -- Active campaigns with a goal: raised so far, counting gifts inside the campaign's dates.
    'campaignGoals', (select coalesce(jsonb_agg(x order by x.ends_on nulls last, x.name), '[]') from (
      select c.name, c.goal_amount as goal, c.starts_on, c.ends_on,
             (select coalesce(sum(cg.amount), 0) from cg where cg.campaign_id = c.id
                 and (c.starts_on is null or cg.gift_date >= c.starts_on) and (c.ends_on is null or cg.gift_date <= c.ends_on)) as raised
        from campaigns c
       where c.org_id = p_org and c.active and c.goal_amount is not null and c.goal_amount > 0
         and (c.ends_on is null or c.ends_on >= (p_as_of - interval '30 days')::date)) x),
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

-- Called from the app. Any member who can see the dashboard can refresh it.
create or replace function app.refresh_dashboard(p_org uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not (app.has_role(p_org, '{owner,admin,staff,board_viewer}') or app.is_system()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v := app.compute_dashboard(p_org, current_date);
  insert into dashboard_snapshots (org_id, as_of, computed_at, data) values (p_org, current_date, now(), v)
  on conflict (org_id, as_of) do update set data = excluded.data, computed_at = excluded.computed_at;
  return v;
end $$;

-- Nightly: every organization. Runs from pg_cron as the database owner.
create or replace function app.refresh_all_dashboards() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from organizations loop
    insert into dashboard_snapshots (org_id, as_of, computed_at, data) values (r.id, current_date, now(), app.compute_dashboard(r.id, current_date))
    on conflict (org_id, as_of) do update set data = excluded.data, computed_at = excluded.computed_at;
    n := n + 1;
  end loop;
  delete from dashboard_snapshots where as_of < current_date - 400;
  return n;
end $$;
revoke all on function app.refresh_all_dashboards() from public;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'dashboard-nightly';
  -- 07:00 UTC is 2 or 3 in the morning on the US East coast.
  perform cron.schedule('dashboard-nightly', '0 7 * * *', 'select app.refresh_all_dashboards()');
exception when others then
  raise notice 'pg_cron is not available here; schedule app.refresh_all_dashboards() another way (%).', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Board links: the public page passes a hash, never sees donor details beyond names,
-- and gets no names at all when the organization hides them.
-- ---------------------------------------------------------------------------
create or replace function app.board_view(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l board_share_links; o organizations; s dashboard_snapshots; v jsonb;
begin
  select * into l from board_share_links where token_hash = p_token_hash and revoked_at is null;
  if l.id is null then return null; end if;
  select * into o from organizations where id = l.org_id;
  select * into s from dashboard_snapshots where org_id = l.org_id order by as_of desc limit 1;
  if s.id is null or s.as_of < current_date then
    v := app.compute_dashboard(l.org_id, current_date);
    insert into dashboard_snapshots (org_id, as_of, computed_at, data) values (l.org_id, current_date, now(), v)
    on conflict (org_id, as_of) do update set data = excluded.data, computed_at = excluded.computed_at
    returning * into s;
  end if;
  update board_share_links set last_viewed_at = now() where id = l.id;
  v := s.data;
  if o.hide_board_names then
    v := jsonb_set(v, '{topGifts}', coalesce((select jsonb_agg(g - 'name' - 'constituentId' - 'giftId' || jsonb_build_object('name', 'A donor')) from jsonb_array_elements(v->'topGifts') g), '[]'));
  else
    v := jsonb_set(v, '{topGifts}', coalesce((select jsonb_agg(g - 'constituentId' - 'giftId') from jsonb_array_elements(v->'topGifts') g), '[]'));
  end if;
  return jsonb_build_object('orgName', o.name, 'computedAt', s.computed_at, 'hideNames', o.hide_board_names, 'data', v);
end $$;
grant execute on function app.board_view(text) to anon, authenticated;
grant execute on function app.refresh_dashboard(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Acknowledging a gift: posted gifts allow only these columns to change (Phase 1 lock).
-- ---------------------------------------------------------------------------
create or replace function app.acknowledge_gifts(p_gift_ids uuid[], p_method text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update gifts g set acknowledged_at = now(), acknowledgment_method = p_method
   where g.id = any(p_gift_ids) and g.posted_at is not null and app.has_role(g.org_id, '{owner,admin,staff}');
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function app.acknowledge_gifts(uuid[], text) to authenticated;
