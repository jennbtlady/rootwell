-- The sample organization shows what a branded public page looks like (fundraising Phase 1,
-- CLAUDE.md rule 6). A new sample organization starts with brand colors that pass contrast:
-- a deep green and a warm brown. It keeps Rootwell's logo slot empty: no fake logo.
-- A trigger rather than an edit to app.create_sample_org (0002), which is already applied.
create or replace function app.sample_branding() returns trigger
language plpgsql as $$
begin
  if new.sample_org_enabled and coalesce(new.branding, '{}'::jsonb) = '{}'::jsonb then
    new.branding := '{"primaryColor":"#1F5E3B","accentColor":"#8A4B12"}'::jsonb;
  end if;
  return new;
end $$;
drop trigger if exists sample_branding on organizations;
create trigger sample_branding before insert on organizations for each row execute function app.sample_branding();
