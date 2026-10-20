-- Runs last. Postgres lets every role execute a new function by default. Functions in
-- `app` are the security boundary, so nothing is executable unless granted here.
revoke execute on all functions in schema app from public;
alter default privileges in schema app revoke execute on functions from public;

-- Signed-in users: every function that checks the caller's role itself.
grant execute on all functions in schema app to authenticated, service_role;

-- Internal only. Called by other security definer functions or by pg_cron, never by users:
-- seed_sample_data has no role check (create_sample_org checks first), and the dashboard
-- computation reads any organization's gifts.
revoke execute on function app.seed_sample_data(uuid) from authenticated, service_role;
revoke execute on function app.compute_dashboard(uuid, date) from authenticated, service_role;
revoke execute on function app.refresh_all_dashboards() from authenticated, service_role;

-- Signed-out visitors: only the board link, which checks the token itself.
grant usage on schema app to anon;
grant execute on function app.board_view(text) to anon;
