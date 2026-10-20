-- Sample organization data: funds, campaigns, appeals, 40 invented constituents, two
-- years of posted gifts, a few interactions and tags. Idempotent per org (skips when the
-- org already has constituents). Called by app.create_sample_org().
create or replace function app.seed_sample_data(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_claims jsonb := app.jwt();
  v_general uuid; v_building uuid; v_food uuid;
  v_spring uuid; v_fall uuid; v_gala uuid;
  v_letter uuid; v_email uuid;
  v_names text[] := array[
    'Dana|Rivera|dana.rivera@example.org|Springfield|62701', 'Marcus|Chen|marcus.chen@example.org|Springfield|62702',
    'Priya|Natarajan|priya.n@example.org|Chatham|62629', 'Tom|Okafor|tom.okafor@example.org|Springfield|62704',
    'Elena|Vasquez|elena.v@example.org|Rochester|62563', 'Jamal|Washington|jwash@example.org|Springfield|62703',
    'Ruth|Goldberg|ruth.goldberg@example.org|Sherman|62684', 'Kenji|Sato|kenji.sato@example.org|Springfield|62711',
    'Aisha|Mohammed|aisha.m@example.org|Chatham|62629', 'Walter|Brennan|wbrennan@example.org|Springfield|62702',
    'Sofia|Morales|sofia.morales@example.org|Rochester|62563', 'Liam|Doyle|liam.doyle@example.org|Springfield|62704',
    'Grace|Kim|grace.kim@example.org|Springfield|62701', 'Hector|Alvarez|hector.a@example.org|Pawnee|62558',
    'Beatrice|Lindqvist|bea.l@example.org|Springfield|62703', 'Samuel|Adeyemi|sam.adeyemi@example.org|Chatham|62629',
    'Nora|Fitzgerald|nora.fitz@example.org|Springfield|62711', 'Victor|Petrov|victor.p@example.org|Sherman|62684',
    'Harriet|Oduya|harriet.o@example.org|Springfield|62702', 'Felix|Marchetti|felix.m@example.org|Springfield|62704',
    'Yuki|Tanaka|yuki.tanaka@example.org|Rochester|62563', 'Omar|Haddad|omar.haddad@example.org|Springfield|62701',
    'Ingrid|Solberg|ingrid.s@example.org|Springfield|62703', 'Caleb|Thornton|caleb.t@example.org|Pawnee|62558',
    'Mei|Wong|mei.wong@example.org|Springfield|62711', 'Desmond|Clarke|des.clarke@example.org|Chatham|62629',
    'Lucia|Ferreira|lucia.f@example.org|Springfield|62702', 'Abdul|Rahman|abdul.r@example.org|Springfield|62704',
    'Patricia|Nowak|pat.nowak@example.org|Sherman|62684', 'George|Mbeki|george.mbeki@example.org|Springfield|62701',
    'Chloe|Dubois|chloe.d@example.org|Rochester|62563', 'Raj|Patel|raj.patel@example.org|Springfield|62703',
    'Miriam|Levine|miriam.l@example.org|Springfield|62711', 'Andre|Baptiste|andre.b@example.org|Chatham|62629',
    'Hannah|Schmidt|hannah.s@example.org|Springfield|62702', 'Kofi|Mensah|kofi.m@example.org|Pawnee|62558'
  ];
  v_orgs text[] := array['Pantry Partners LLC|Springfield', 'First Street Church|Springfield', 'Prairie Community Foundation|Chatham', 'Lincoln Hardware|Sherman'];
  v_ids uuid[] := '{}';
  v_id uuid; v_i int; v_parts text[]; v_batch uuid; v_month date; v_uid uuid := app.uid();
  v_amounts numeric[] := array[25, 50, 50, 75, 100, 100, 150, 200, 250, 500];
begin
  if exists (select 1 from constituents where org_id = p_org) then return; end if;

  -- Writes happen as the system actor for this org so posted gifts can be inserted directly.
  perform set_config('request.jwt.claims', (v_claims || jsonb_build_object('actor', 'system', 'org_id', p_org))::text, true);

  insert into funds (org_id, name, code, description) values (p_org, 'General operating', 'GEN', 'Unrestricted. Keeps the lights on.') returning id into v_general;
  insert into funds (org_id, name, code, description) values (p_org, 'Food purchasing', 'FOOD', 'Restricted to buying food.') returning id into v_food;
  insert into funds (org_id, name, code, description) values (p_org, 'Building', 'BLDG', 'Restricted to the warehouse roof project.') returning id into v_building;
  insert into campaigns (org_id, name, code, goal_amount, starts_on, ends_on) values (p_org, 'Spring appeal', 'SPR', 15000, date_trunc('year', current_date)::date, (date_trunc('year', current_date) + interval '5 months')::date) returning id into v_spring;
  insert into campaigns (org_id, name, code, goal_amount, starts_on, ends_on) values (p_org, 'Fall appeal', 'FALL', 25000, (date_trunc('year', current_date) - interval '4 months')::date, (date_trunc('year', current_date) - interval '1 day')::date) returning id into v_fall;
  insert into campaigns (org_id, name, code, goal_amount) values (p_org, 'Harvest gala', 'GALA', 20000) returning id into v_gala;
  insert into appeals (org_id, name, code, campaign_id) values (p_org, 'March letter', 'SPR-LTR', v_spring) returning id into v_letter;
  insert into appeals (org_id, name, code, campaign_id) values (p_org, 'April email', 'SPR-EM', v_spring) returning id into v_email;
  update organizations set gift_entry_standards = jsonb_build_object(
    'requiredFields', jsonb_build_array('campaignId'), 'checkNumberForChecks', true, 'defaultFundId', v_general, 'useBatches', true,
    'fieldInstructions', jsonb_build_object('campaignId', 'Use the campaign printed on the reply card. If there is none, use the current appeal.', 'checkNumber', 'The number in the top right of the check.', 'notes', 'Anything the thank-you letter should mention.'),
    'conventions', E'Batches are one per deposit, named for the day the deposit is made.\nAnonymous gifts go to the constituent named "Anonymous donor".\nIn-kind gifts need a fair market value from the donor''s letter.')
  where id = p_org;

  for v_i in 1..array_length(v_names, 1) loop
    v_parts := string_to_array(v_names[v_i], '|');
    insert into constituents (org_id, type, first_name, last_name, source)
    values (p_org, 'person', v_parts[1], v_parts[2], (array['mailing', 'event', 'website', 'referral'])[1 + (v_i % 4)])
    returning id into v_id;
    v_ids := v_ids || v_id;
    insert into constituent_emails (org_id, constituent_id, email, is_primary) values (p_org, v_id, v_parts[3], true);
    if v_i % 3 <> 0 then
      insert into constituent_phones (org_id, constituent_id, phone, is_primary) values (p_org, v_id, format('(217) 555-%s', lpad((1000 + v_i * 37)::text, 4, '0')), true);
    end if;
    insert into constituent_addresses (org_id, constituent_id, line1, city, state, postal_code, is_primary)
    values (p_org, v_id, format('%s %s', 100 + v_i * 7, (array['Elm St', 'Oak Ave', 'Maple Dr', 'Prairie Rd', 'Lincoln Blvd'])[1 + (v_i % 5)]), v_parts[4], 'IL', v_parts[5], true);
  end loop;
  for v_i in 1..array_length(v_orgs, 1) loop
    v_parts := string_to_array(v_orgs[v_i], '|');
    insert into constituents (org_id, type, org_name, source) values (p_org, 'organization', v_parts[1], 'referral') returning id into v_id;
    v_ids := v_ids || v_id;
    insert into constituent_addresses (org_id, constituent_id, line1, city, state, postal_code, is_primary) values (p_org, v_id, format('%s Main St', 10 * v_i), v_parts[2], 'IL', '62701', true);
  end loop;
  insert into constituents (org_id, type, org_name, notes) values (p_org, 'household', 'Anonymous donor', 'Use for gifts with no donor name.');

  -- Relationships, tags, interactions.
  insert into relationships (org_id, from_constituent_id, to_constituent_id, type, reciprocal_type) values (p_org, v_ids[1], v_ids[2], 'spouse', 'spouse');
  insert into relationships (org_id, from_constituent_id, to_constituent_id, type, reciprocal_type) values (p_org, v_ids[4], v_ids[37], 'employee', 'employer');
  insert into tags (org_id, name) values (p_org, 'Board'), (p_org, 'Monthly donor'), (p_org, 'Volunteer');
  insert into constituent_tags (org_id, constituent_id, tag_id) select p_org, v_ids[i], t.id from generate_series(1, 5) i, tags t where t.org_id = p_org and t.name = 'Board';
  insert into constituent_tags (org_id, constituent_id, tag_id) select p_org, v_ids[i], t.id from generate_series(6, 12) i, tags t where t.org_id = p_org and t.name = 'Monthly donor';
  insert into interactions (org_id, constituent_id, type, occurred_on, summary, owner_id) values
    (p_org, v_ids[1], 'call', current_date - 12, 'Thanked her for the spring gift. She asked about the roof project.', v_uid),
    (p_org, v_ids[2], 'meeting', current_date - 40, 'Coffee. Interested in joining the board next year.', v_uid),
    (p_org, v_ids[37], 'email', current_date - 5, 'Sent the sponsorship packet for the gala.', v_uid);

  -- Two years of monthly batches. Each has 6 to 14 gifts from a rotating set of donors.
  for v_i in 0..23 loop
    v_month := (date_trunc('month', current_date) - (v_i || ' months')::interval)::date;
    insert into batches (org_id, batch_date, description, status, posted_at, posted_by)
    values (p_org, v_month + 9, 'Deposit ' || to_char(v_month + 9, 'Mon DD'), 'posted', v_month + 10, v_uid)
    returning id into v_batch;
    insert into gifts (org_id, constituent_id, batch_id, amount, gift_date, fund_id, campaign_id, appeal_id, payment_method, check_number, posted_at, posted_by)
    select p_org, v_ids[1 + ((v_i * 7 + g * 11) % array_length(v_ids, 1))], v_batch,
           v_amounts[1 + ((v_i + g) % 10)] * (case when g % 9 = 0 then 4 else 1 end),
           v_month + 2 + (g % 7),
           case when g % 5 = 0 then v_food when g % 11 = 0 then v_building else v_general end,
           case when extract(month from v_month) in (3, 4, 5) then v_spring when extract(month from v_month) in (9, 10, 11) then v_fall when extract(month from v_month) = 12 then v_gala else null end,
           case when extract(month from v_month) = 3 then v_letter when extract(month from v_month) = 4 then v_email else null end,
           case when g % 4 = 0 then 'card'::payment_method when g % 7 = 0 then 'cash'::payment_method else 'check'::payment_method end,
           case when g % 4 = 0 or g % 7 = 0 then null else (1000 + v_i * 20 + g)::text end,
           v_month + 10, v_uid
      from generate_series(1, 6 + ((v_i * 5) % 9)) g;
  end loop;

  -- One open batch with two gifts, so posting can be tried right away.
  insert into batches (org_id, batch_date, description, expected_total, expected_count) values (p_org, current_date, 'Today''s mail', 350, 2) returning id into v_batch;
  insert into gifts (org_id, constituent_id, batch_id, amount, gift_date, fund_id, campaign_id, payment_method, check_number)
  values (p_org, v_ids[3], v_batch, 250, current_date, v_general, v_spring, 'check', '4471'), (p_org, v_ids[8], v_batch, 100, current_date, v_food, v_spring, 'cash', null);

  -- Phase 5: a giving page, two online gifts waiting for their Stripe deposit, and the
  -- QuickBooks account names, so those screens have something in them.
  update funds set income_account = '4000 Contributions:Unrestricted' where id = v_general;
  update funds set income_account = '4010 Contributions:Restricted' where id = v_food;
  update organizations set accounting = '{"depositAccount":"Checking","feeAccount":"Merchant fees","defaultIncomeAccount":"Contributions"}'::jsonb where id = p_org;
  insert into donation_pages (org_id, slug, title, intro, thank_you, fund_ids, campaign_id)
  values (p_org, 'sample-' || left(replace(p_org::text, '-', ''), 12), 'Feed a neighbor', 'Every $25 puts a week of groceries on a family''s table.',
          'Thank you. Your gift is already at work in the pantry.', array[v_general, v_food], v_spring);
  insert into gifts (org_id, constituent_id, amount, gift_date, fund_id, campaign_id, payment_method, reference, external_source, external_id, fee_amount, net_amount, fee_covered_amount, source_platform)
  values (p_org, v_ids[14], 102.56, current_date - 1, v_general, v_spring, 'card', 'ch_sample_1', 'stripe', 'ch_sample_1', 2.56, 100.00, 2.56, 'stripe'),
         (p_org, v_ids[21], 50, current_date, v_food, v_spring, 'card', 'ch_sample_2', 'stripe', 'ch_sample_2', 1.40, 48.60, null, 'stripe');

  -- History is thanked, the way a working office would have it; the last few weeks are not.
  update gifts set acknowledged_at = (gift_date + 3)::timestamptz, acknowledgment_method = case when amount >= 250 then 'letter' else 'email' end
   where org_id = p_org and posted_at is not null and gift_date < current_date - 20;
  -- Give the sample an EIN and address so letters and statements look finished.
  update organizations set ein = coalesce(ein, '00-0000000'), address = case when address = '{}'::jsonb then '{"line1":"100 Main St","city":"Springfield","state":"IL","postalCode":"62701"}'::jsonb else address end where id = p_org;

  perform set_config('request.jwt.claims', v_claims::text, true);
end $$;
