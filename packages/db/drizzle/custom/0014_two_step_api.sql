-- Two-step sign-in at the API (launch review, must fix 1).
--
-- The /app layout sends anyone with a verified authenticator to /mfa/verify, and owners and
-- admins of a real organization to /mfa/enroll. The API now applies the same rule, so a
-- phished password cannot skip the pages and call the API directly.
--
-- app.has_verified_factor() reads Supabase's auth.mfa_factors, which signed-in users cannot
-- see, so it is security definer. It answers only for the caller (app.uid()), never for
-- anyone else. 0099 grants it to authenticated with the other app functions.
create or replace function app.has_verified_factor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.mfa_factors f
     where f.user_id = app.uid() and f.status = 'verified' and f.factor_type = 'totp'
  )
$$;
