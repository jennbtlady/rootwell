-- Logos and header images for public pages (fundraising Phase 1). Idempotent.
--
-- A public bucket: public pages show these images to anyone, so anyone may view them. Each
-- organization's images live in a folder named for its id. Only that organization's owners
-- and admins, signed in with two-step sign-in, may add, replace or remove them. Storage
-- itself refuses anything but PNG, JPEG or WebP (no SVG, which can carry scripts) over 2 MB.
-- organizations.logo_path and organizations.branding point at these files; core checks a
-- saved path is in the organization's own folder.
--
-- Rollback: drop the four policies and delete the bucket (and its objects) in the dashboard.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 2097152, '{image/png,image/jpeg,image/webp}')
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The folder name as an organization id, or null when it is not one.
create or replace function app.branding_folder_org(p_name text) returns uuid
language sql immutable as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end
$$;

drop policy if exists branding_insert on storage.objects;
create policy branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and app.has_role(app.branding_folder_org(name), '{owner,admin}') and app.is_aal2());
drop policy if exists branding_update on storage.objects;
create policy branding_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and app.has_role(app.branding_folder_org(name), '{owner,admin}') and app.is_aal2())
  with check (bucket_id = 'branding' and app.has_role(app.branding_folder_org(name), '{owner,admin}') and app.is_aal2());
drop policy if exists branding_delete on storage.objects;
create policy branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and app.has_role(app.branding_folder_org(name), '{owner,admin}') and app.is_aal2());
-- Uploading through the storage API reads the row back, so members need select too. The
-- bucket is public anyway: these are the images on public pages.
drop policy if exists branding_select on storage.objects;
create policy branding_select on storage.objects for select to authenticated using (bucket_id = 'branding');
