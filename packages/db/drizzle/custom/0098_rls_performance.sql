-- RLS performance. Runs after every policy file and before 0099. Idempotent.
--
-- Policies were written as app.has_role(org_id, '{...}'): readable, but has_role is a
-- security definer function, so Postgres calls it once per row, and each call runs its own
-- membership lookup. With 10,000 donors that is 10,000 lookups per search.
--
-- This rewrites each policy, without changing what it allows, into the form Postgres runs
-- once per query:
--   app.has_role(org_id, R)   becomes  org_id = any ((select app.org_ids_with_role(R))::uuid[])
--   app.org_writable(org_id)  becomes  org_id = any ((select app.writable_org_ids())::uuid[])
--   app.is_aal2(), app.is_system()  become  (select app.is_aal2()), (select app.is_system())
-- The (select ...) wrapper makes each an InitPlan: evaluated once, then compared per row,
-- which also lets the org_id indexes do the work. Write new policies in the readable form;
-- this file converts them. The isolation tests in packages/db/test prove nothing changed.

create or replace function app.org_ids_with_role(p_roles text[]) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(x), '{}') from (
    select org_id as x from org_memberships
     where user_id = app.uid() and status = 'active' and role::text = any(p_roles)
    union
    select app.system_org_id() where app.is_system()
  ) s
$$;

create or replace function app.writable_org_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from organizations o
   where o.id in (select app.member_org_ids()) and app.org_writable(o.id)
$$;

grant execute on function app.org_ids_with_role(text[]), app.writable_org_ids() to authenticated, service_role;

do $$
declare
  p record;
  q text;
  c text;
  roles text;
  stmt text;
  fast text := '(%1$s = ANY ((SELECT app.org_ids_with_role(%2$s))::uuid[]))';
begin
  for p in select * from pg_policies where schemaname = 'public' loop
    q := p.qual;
    c := p.with_check;
    -- Rewrite every has_role(column, roles) call, one at a time.
    while q ~ 'app\.has_role\(' loop
      q := regexp_replace(q, 'app\.has_role\(([a-z_.]+), (''[^'']*''::text\[\])\)', format(fast, '\1', '\2'));
      exit when q !~ 'app\.has_role\(([a-z_.]+), (''[^'']*''::text\[\])\)';
    end loop;
    while c ~ 'app\.has_role\(' loop
      c := regexp_replace(c, 'app\.has_role\(([a-z_.]+), (''[^'']*''::text\[\])\)', format(fast, '\1', '\2'));
      exit when c !~ 'app\.has_role\(([a-z_.]+), (''[^'']*''::text\[\])\)';
    end loop;
    q := regexp_replace(q, 'app\.org_writable\(([a-z_.]+)\)', '(\1 = ANY ((SELECT app.writable_org_ids())::uuid[]))', 'g');
    c := regexp_replace(c, 'app\.org_writable\(([a-z_.]+)\)', '(\1 = ANY ((SELECT app.writable_org_ids())::uuid[]))', 'g');
    q := regexp_replace(q, '(?<!SELECT )app\.(is_aal2|is_system)\(\)', '(SELECT app.\1())', 'g');
    c := regexp_replace(c, '(?<!SELECT )app\.(is_aal2|is_system)\(\)', '(SELECT app.\1())', 'g');
    if q is not distinct from p.qual and c is not distinct from p.with_check then continue; end if;
    execute format('alter policy %I on %I.%I %s %s', p.policyname, p.schemaname, p.tablename,
      case when q is not null then format('using (%s)', q) else '' end,
      case when c is not null then format('with check (%s)', c) else '' end);
  end loop;
end $$;
