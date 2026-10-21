-- Year-end statement sends (Dana's walkthrough: statements could be emailed twice). Idempotent.

drop trigger if exists set_row_meta on statement_sends;
create trigger set_row_meta before insert or update on statement_sends for each row execute function app.set_row_meta();
drop trigger if exists audit on statement_sends;
create trigger audit after insert or update or delete on statement_sends for each row execute function app.audit_trigger();
drop trigger if exists check_org_constituent_id on statement_sends;
create trigger check_org_constituent_id before insert or update on statement_sends for each row execute function app.check_child_org('constituents', 'constituent_id');

alter table statement_sends drop constraint if exists statement_sends_channel_check;
alter table statement_sends add constraint statement_sends_channel_check check (channel in ('email', 'print'));
alter table statement_sends drop constraint if exists statement_sends_status_check;
alter table statement_sends add constraint statement_sends_status_check check (status in ('sent', 'failed'));
alter table statement_sends drop constraint if exists statement_sends_year_check;
alter table statement_sends add constraint statement_sends_year_check check (tax_year between 2000 and 2100);

alter table statement_sends enable row level security;
-- Staff can see what went out; owners and admins send statements, so they record them.
drop policy if exists statement_sends_select on statement_sends;
create policy statement_sends_select on statement_sends for select to authenticated using (app.has_role(org_id, '{owner,admin,staff}'));
drop policy if exists statement_sends_write on statement_sends;
create policy statement_sends_write on statement_sends for all to authenticated
  using (app.has_role(org_id, '{owner,admin}')) with check (app.has_role(org_id, '{owner,admin}'));

-- Read only for a lapsed account, like every other table of donor data (0009).
drop policy if exists statement_sends_writable_insert on statement_sends;
create policy statement_sends_writable_insert on statement_sends as restrictive for insert to authenticated with check (app.is_system() or app.org_writable(org_id));
drop policy if exists statement_sends_writable_update on statement_sends;
create policy statement_sends_writable_update on statement_sends as restrictive for update to authenticated using (app.is_system() or app.org_writable(org_id)) with check (app.is_system() or app.org_writable(org_id));
drop policy if exists statement_sends_writable_delete on statement_sends;
create policy statement_sends_writable_delete on statement_sends as restrictive for delete to authenticated using (app.is_system() or app.org_writable(org_id));
