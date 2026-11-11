-- candidate_partners: look up the donor's own emails, phones and ZIPs first, then search
-- by organization plus those exact values.
--
-- The 0010 version joined the donor's own rows to everyone else's in one query. When the
-- tables look nearly empty to the planner (a new database, or an organization's first big
-- import, where the rows being added are not yet in the statistics), it chose a nested loop
-- that reread every phone and address row once per row. A 5,000-row import then took over
-- 40 minutes instead of under two. With the values fixed up front, each branch is a plain
-- lookup on (org_id, value), so the cost stays linear whatever the statistics say.
--
-- Matching rules are unchanged: same email, same phone of 7+ digits, similar name (0.6),
-- or same last name with the same 5-character ZIP.
create or replace function app.candidate_partners(p_id uuid)
returns setof uuid
language plpgsql volatile security invoker as $$
declare
  v_org uuid;
  v_name text;
  v_last text;
  v_emails text[];
  v_digits text[];
  v_zips text[];
begin
  perform set_config('pg_trgm.similarity_threshold', '0.6', true);

  select org_id, lower(display_name), lower(coalesce(last_name, ''))
    into v_org, v_name, v_last
    from constituents where id = p_id;
  if not found then return; end if;

  select array_agg(email) into v_emails
    from constituent_emails where constituent_id = p_id;
  select array_agg(digits) into v_digits
    from constituent_phones where constituent_id = p_id and length(digits) >= 7;
  select array_agg(left(regexp_replace(coalesce(postal_code, ''), '\s', '', 'g'), 5)) into v_zips
    from constituent_addresses where constituent_id = p_id and coalesce(postal_code, '') <> '';

  return query
  select x.cid from (
    select e.constituent_id as cid from constituent_emails e
     where v_emails is not null and e.org_id = v_org and e.email = any(v_emails)
    union
    select p.constituent_id from constituent_phones p
     where v_digits is not null and p.org_id = v_org and p.digits = any(v_digits)
    union
    select o.id from constituents o
     where o.org_id = v_org and lower(o.display_name) % v_name
       and similarity(lower(o.display_name), v_name) >= 0.6
    union
    select a.constituent_id from constituent_addresses a
      join constituents o on o.id = a.constituent_id
     where v_zips is not null and v_last <> ''
       and a.org_id = v_org
       and left(regexp_replace(coalesce(a.postal_code, ''), '\s', '', 'g'), 5) = any(v_zips)
       and o.org_id = v_org and lower(coalesce(o.last_name, '')) = v_last
  ) x where x.cid <> p_id;
end $$;
