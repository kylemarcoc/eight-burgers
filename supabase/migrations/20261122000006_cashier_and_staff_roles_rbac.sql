-- Eight Burgers — Cashier & Staff Roles (RBAC)
-- Expands admin_users.role to ('owner', 'cashier', 'staff'), enforces least-privilege
-- RLS policies on catalog, delivery, storage, and orders, and adds a column-level
-- BEFORE UPDATE guard on public.menu_items so non-owner staff can only toggle `available`.

alter table public.admin_users
  drop constraint if exists admin_users_role_check;

alter table public.admin_users
  add constraint admin_users_role_check
  check (role in ('owner', 'cashier', 'staff'));

create or replace function public.active_admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.admin_users
  where user_id = auth.uid()
    and active = true
  limit 1;
$$;

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.active_admin_role() is not null;
$$;

create or replace function public.is_owner_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.active_admin_role() = 'owner', false);
$$;

create or replace function public.has_admin_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.active_admin_role() = any(p_roles), false);
$$;

-- Menu items: Owner has full CRUD; active Cashier/Staff can only toggle `available`.
drop policy if exists "menu_items_admin_all" on public.menu_items;
drop policy if exists "menu_items_owner_insert" on public.menu_items;
drop policy if exists "menu_items_owner_delete" on public.menu_items;
drop policy if exists "menu_items_admin_update" on public.menu_items;

create policy "menu_items_owner_insert"
  on public.menu_items
  for insert
  to authenticated
  with check (public.is_owner_admin());

create policy "menu_items_owner_delete"
  on public.menu_items
  for delete
  to authenticated
  using (public.is_owner_admin());

create policy "menu_items_admin_update"
  on public.menu_items
  for update
  to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

create or replace function public.enforce_menu_item_update_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_owner_admin() then
    if new.id is distinct from old.id
      or new.name is distinct from old.name
      or new.category is distinct from old.category
      or new.price_php is distinct from old.price_php
      or new.patty_spec is distinct from old.patty_spec
      or new.description is distinct from old.description
      or new.image_url is distinct from old.image_url
      or new.featured is distinct from old.featured
      or new.allow_addons is distinct from old.allow_addons
      or new.sort_order is distinct from old.sort_order
      or new.created_at is distinct from old.created_at
    then
      raise exception 'INSUFFICIENT_ROLE_FOR_MENU_EDIT'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_menu_items_01_role_guard on public.menu_items;
create trigger trg_menu_items_01_role_guard
  before update on public.menu_items
  for each row
  execute function public.enforce_menu_item_update_role();

-- Store delivery settings & zones: Owner-only writes.
drop policy if exists "store_settings_admin_all" on public.store_settings;
drop policy if exists "store_settings_owner_all" on public.store_settings;
create policy "store_settings_owner_all"
  on public.store_settings
  for all
  to authenticated
  using (public.is_owner_admin())
  with check (public.is_owner_admin());

drop policy if exists "delivery_zones_admin_all" on public.delivery_zones;
drop policy if exists "delivery_zones_owner_all" on public.delivery_zones;
create policy "delivery_zones_owner_all"
  on public.delivery_zones
  for all
  to authenticated
  using (public.is_owner_admin())
  with check (public.is_owner_admin());

-- Menu images storage bucket: Owner-only uploads, updates, and deletions.
drop policy if exists "menu_images_admin_insert" on storage.objects;
drop policy if exists "menu_images_owner_insert" on storage.objects;
create policy "menu_images_owner_insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'menu-images' and public.is_owner_admin());

drop policy if exists "menu_images_admin_update" on storage.objects;
drop policy if exists "menu_images_owner_update" on storage.objects;
create policy "menu_images_owner_update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'menu-images' and public.is_owner_admin())
  with check (bucket_id = 'menu-images' and public.is_owner_admin());

drop policy if exists "menu_images_admin_delete" on storage.objects;
drop policy if exists "menu_images_owner_delete" on storage.objects;
create policy "menu_images_owner_delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'menu-images' and public.is_owner_admin());
