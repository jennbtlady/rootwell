-- Rate limits (launch review, must fix 3). Counts live in the database because on Vercel
-- each request can land on a different server, so counts kept in memory would not add up.
--
-- rate_limit_hits holds one row per limit per time window. It is not tenant data and has no
-- org_id. RLS is on with no policies, so no role can read or write it directly. The only way
-- in is app.hit_rate_limit(), which the API and the board page call. The `app` schema is not
-- exposed through Supabase's Data API, so a browser cannot call it either.

alter table rate_limit_hits enable row level security;
revoke all on table rate_limit_hits from anon, authenticated;

-- Counts one request against a limit and says whether it is allowed. Fixed windows: the
-- count resets at the start of each window. p_bucket names the limit and who it counts, for
-- example 'give-ip:<hash>' or 'statements-org:<uuid>'.
create or replace function app.hit_rate_limit(p_bucket text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_start timestamptz;
  v_hits int;
begin
  if p_bucket is null or length(p_bucket) > 200 or p_limit < 1 or p_window_seconds not between 1 and 86400 then
    raise exception 'bad rate limit' using errcode = '22023';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limit_hits as r (bucket, window_start, hits)
  values (p_bucket, v_start, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;
  return v_hits <= p_limit;
end $$;

-- Old windows are no use once they end. Keep a day for looking into an incident.
create or replace function app.prune_rate_limits() returns int
language sql volatile security definer set search_path = '' as $$
  with gone as (delete from public.rate_limit_hits where window_start < now() - interval '1 day' returning 1)
  select count(*)::int from gone
$$;

-- The giving page and the board link run as anon before anyone signs in.
grant usage on schema app to anon;
grant execute on function app.hit_rate_limit(text, int, int) to anon;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'rate-limits-prune';
  perform cron.schedule('rate-limits-prune', '17 * * * *', 'select app.prune_rate_limits()');
exception when others then
  raise notice 'pg_cron is not available here; run app.prune_rate_limits() another way (%).', sqlerrm;
end $$;
