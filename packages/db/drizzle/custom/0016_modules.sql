-- Modules per organization (fundraising Phase 1). Idempotent.
--
-- organization_modules says which parts of Rootwell an organization has. Members read their
-- own organization's rows; only the system actor for that organization writes them. A Noble
-- Maple admin turns modules on with `pnpm --filter @maple/db modules`, which runs as the
-- system actor, until billing does it. Bundles map to modules in packages/core/src/modules.ts.

drop trigger if exists set_row_meta on organization_modules;
create trigger set_row_meta before insert or update on organization_modules for each row execute function app.set_row_meta();
drop trigger if exists audit on organization_modules;
create trigger audit after insert or update or delete on organization_modules for each row execute function app.audit_trigger();

alter table organization_modules enable row level security;
drop policy if exists organization_modules_select on organization_modules;
create policy organization_modules_select on organization_modules for select to authenticated
  using (app.has_role(org_id, '{owner,admin,staff,system}'));
drop policy if exists organization_modules_write on organization_modules;
create policy organization_modules_write on organization_modules for all to authenticated
  using (app.has_role(org_id, '{system}')) with check (app.has_role(org_id, '{system}'));

-- Every organization has the Core bundle (donations), including ones made before modules
-- existed, so giving pages keep working.
create or replace function app.add_core_modules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into organization_modules (org_id, module) values (new.id, 'donations') on conflict do nothing;
  return new;
end $$;
drop trigger if exists add_core_modules on organizations;
create trigger add_core_modules after insert on organizations for each row execute function app.add_core_modules();
insert into organization_modules (org_id, module) select id, 'donations' from organizations on conflict do nothing;

-- For checks that run before anyone signs in, such as the public giving page. Says only
-- whether an organization has a module.
create or replace function app.org_has_module(p_org uuid, p_module org_module) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from organization_modules where org_id = p_org and module = p_module)
$$;
grant execute on function app.org_has_module(uuid, org_module) to anon;
