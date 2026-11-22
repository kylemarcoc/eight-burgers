-- Eight Burgers — Owner Team Management RLS Policies
-- Allows active Owners to view, create, and update Staff Portal accounts in public.admin_users
-- while non-owner roles remain restricted to reading only their own membership row.

drop policy if exists "admin_users_owner_select" on public.admin_users;
create policy "admin_users_owner_select"
  on public.admin_users
  for select
  to authenticated
  using (public.is_owner_admin());

drop policy if exists "admin_users_owner_insert" on public.admin_users;
create policy "admin_users_owner_insert"
  on public.admin_users
  for insert
  to authenticated
  with check (public.is_owner_admin());

drop policy if exists "admin_users_owner_update" on public.admin_users;
create policy "admin_users_owner_update"
  on public.admin_users
  for update
  to authenticated
  using (public.is_owner_admin())
  with check (public.is_owner_admin());
