-- Menu images storage bucket and admin-only write RLS policies

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-images',
  'menu-images',
  true,
  5242880,
  array['image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "menu_images_public_read" on storage.objects;
create policy "menu_images_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'menu-images');

drop policy if exists "menu_images_admin_insert" on storage.objects;
create policy "menu_images_admin_insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'menu-images' and public.is_active_admin());

drop policy if exists "menu_images_admin_update" on storage.objects;
create policy "menu_images_admin_update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'menu-images' and public.is_active_admin())
  with check (bucket_id = 'menu-images' and public.is_active_admin());

drop policy if exists "menu_images_admin_delete" on storage.objects;
create policy "menu_images_admin_delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'menu-images' and public.is_active_admin());
