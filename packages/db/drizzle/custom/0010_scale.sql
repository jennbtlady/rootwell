-- Phase 6 load test fixes for duplicate matching. Idempotent.
--
-- 1. The name rule uses the trigram % operator. By default % matches at 0.3 similarity and
--    the 0.6 cutoff was applied afterwards, so the index returned far too many rows. Each
--    function now sets pg_trgm.similarity_threshold to 0.6 for its transaction (Postgres
--    does not allow it as a function SET clause here), so the index stops at 0.6. Every
--    other use of % in this app also filters at 0.6 or higher, so nothing else changes.
-- 2. The whole-organization scan looped person by person (10,000 separate lookups for
--    10,000 donors). It now finds candidate pairs in one set-based query per rule, then
--    scores each pair once. Similar names are compared within name groups (see below).

drop function if exists app.candidate_partners(uuid);
create or replace function app.candidate_partners(p_id uuid)
returns setof uuid
language plpgsql volatile security invoker as $$
begin
  perform set_config('pg_trgm.similarity_threshold', '0.6', true);
  return query
  with me as (select * from constituents where id = p_id)
  select x.cid from (
    select eb.constituent_id as cid from me join constituent_emails ea on ea.constituent_id = me.id join constituent_emails eb on eb.org_id = me.org_id and eb.email = ea.email
    union select pb.constituent_id from me join constituent_phones pa on pa.constituent_id = me.id join constituent_phones pb on pb.org_id = me.org_id and pb.digits = pa.digits and length(pa.digits) >= 7
    union select o.id from me join constituents o on o.org_id = me.org_id and lower(o.display_name) % lower(me.display_name)
           where similarity(lower(o.display_name), lower(me.display_name)) >= 0.6
    union select xb.constituent_id from me join constituent_addresses xa on xa.constituent_id = me.id
           join constituent_addresses xb on xb.org_id = me.org_id and coalesce(xa.postal_code, '') <> ''
             and left(regexp_replace(coalesce(xb.postal_code, ''), '\s', '', 'g'), 5) = left(regexp_replace(coalesce(xa.postal_code, ''), '\s', '', 'g'), 5)
           join constituents o on o.id = xb.constituent_id and coalesce(me.last_name, '') <> '' and lower(coalesce(o.last_name, '')) = lower(me.last_name)
  ) x where x.cid <> p_id;
end $$;

create or replace function app.scan_duplicates(p_org uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform set_config('pg_trgm.similarity_threshold', '0.6', true);
  if not app.has_role(p_org, '{owner,admin,staff}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  insert into duplicate_candidates (org_id, a_id, b_id, score, reasons)
  select p_org, p.a, p.b, s.score, s.reasons
    from (
      select least(e1.constituent_id, e2.constituent_id) as a, greatest(e1.constituent_id, e2.constituent_id) as b
        from constituent_emails e1
        join constituent_emails e2 on e2.org_id = p_org and e2.email = e1.email and e2.constituent_id <> e1.constituent_id
       where e1.org_id = p_org
      union
      select least(p1.constituent_id, p2.constituent_id), greatest(p1.constituent_id, p2.constituent_id)
        from constituent_phones p1
        join constituent_phones p2 on p2.org_id = p_org and p2.digits = p1.digits and p2.constituent_id <> p1.constituent_id
       where p1.org_id = p_org and length(p1.digits) >= 7
      union
      -- Similar names, compared within groups that share a last name, a first name, or
      -- (for organizations and households) the first four letters of the name. Measured on
      -- 10,000 donors: 1.7 seconds instead of 25, finding 98.6% of what a full trigram
      -- self-join finds. The rest differ in both first and last name; the check that runs
      -- when each donor is added (candidate_partners) still uses the full index.
      select least(c1.id, c2.id), greatest(c1.id, c2.id)
        from constituents c1
        join constituents c2 on c2.org_id = p_org and c2.id > c1.id and lower(c2.last_name) = lower(c1.last_name)
       where c1.org_id = p_org and coalesce(c1.last_name, '') <> '' and similarity(lower(c1.display_name), lower(c2.display_name)) >= 0.6
      union
      select least(c1.id, c2.id), greatest(c1.id, c2.id)
        from constituents c1
        join constituents c2 on c2.org_id = p_org and c2.id > c1.id and lower(c2.first_name) = lower(c1.first_name)
       where c1.org_id = p_org and coalesce(c1.first_name, '') <> '' and similarity(lower(c1.display_name), lower(c2.display_name)) >= 0.6
      union
      select least(c1.id, c2.id), greatest(c1.id, c2.id)
        from constituents c1
        join constituents c2 on c2.org_id = p_org and c2.id > c1.id and c2.type = c1.type and left(lower(c2.display_name), 4) = left(lower(c1.display_name), 4)
       where c1.org_id = p_org and c1.type <> 'person' and similarity(lower(c1.display_name), lower(c2.display_name)) >= 0.6
      union
      select least(x1.constituent_id, x2.constituent_id), greatest(x1.constituent_id, x2.constituent_id)
        from constituent_addresses x1
        join constituent_addresses x2 on x2.org_id = p_org and x2.constituent_id > x1.constituent_id
             and left(regexp_replace(coalesce(x2.postal_code, ''), '\s', '', 'g'), 5) = left(regexp_replace(coalesce(x1.postal_code, ''), '\s', '', 'g'), 5)
        join constituents c1 on c1.id = x1.constituent_id and coalesce(c1.last_name, '') <> ''
        join constituents c2 on c2.id = x2.constituent_id and lower(c2.last_name) = lower(c1.last_name)
       where x1.org_id = p_org and coalesce(x1.postal_code, '') <> ''
    ) p
    cross join lateral app.score_pair(p.a, p.b) s
  on conflict (org_id, a_id, b_id) do update
    set score = excluded.score, reasons = excluded.reasons
    where duplicate_candidates.status = 'open';

  -- Drop open candidates whose pair no longer scores (contact details were fixed).
  delete from duplicate_candidates d
   where d.org_id = p_org and d.status = 'open'
     and not exists (select 1 from app.score_pair(d.a_id, d.b_id));
  select count(*) into v_n from duplicate_candidates where org_id = p_org and status = 'open';
  return v_n;
end $$;
