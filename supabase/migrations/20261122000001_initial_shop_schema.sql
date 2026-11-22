-- Eight Burgers (Chino Roces Avenue) — Initial Schema & Row-Level Security
-- Target: PostgreSQL 17 (Supabase)

create sequence if not exists public.order_queue_seq
  as bigint
  start with 101
  increment by 1
  minvalue 101
  no cycle;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('owner', 'staff')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_admin_users_updated_at
  before update on public.admin_users
  for each row
  execute function public.set_updated_at();

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
      and active = true
  );
$$;

create table public.menu_addons (
  id text primary key,
  name text not null,
  price_php integer not null check (price_php >= 0),
  sort_order integer not null default 0
);

create table public.menu_items (
  id text primary key,
  name text not null,
  category text not null check (
    category in ('classic-burgers', 'specialty-burgers', 'heavyweights', 'sides-snacks')
  ),
  price_php integer not null check (price_php > 0),
  patty_spec text not null default '',
  description text not null default '',
  image_url text not null default '',
  available boolean not null default true,
  featured boolean not null default false,
  allow_addons boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_menu_items_updated_at
  before update on public.menu_items
  for each row
  execute function public.set_updated_at();

create index idx_menu_items_category_sort on public.menu_items (category, sort_order, created_at desc);

create table public.store_settings (
  id smallint primary key default 1 check (id = 1),
  free_delivery_min_subtotal_php integer check (
    free_delivery_min_subtotal_php is null or free_delivery_min_subtotal_php > 0
  ),
  origin_lat double precision not null default 14.5608 check (origin_lat between -90 and 90),
  origin_lng double precision not null default 121.0124 check (origin_lng between -180 and 180),
  updated_at timestamptz not null default now()
);

create trigger trg_store_settings_updated_at
  before update on public.store_settings
  for each row
  execute function public.set_updated_at();

create table public.delivery_zones (
  id text primary key,
  name text not null,
  areas text not null default '',
  max_distance_km numeric(6, 1) not null check (max_distance_km > 0),
  fee_php integer not null check (fee_php >= 0),
  eta_minutes text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_delivery_zones_updated_at
  before update on public.delivery_zones
  for each row
  execute function public.set_updated_at();

create index idx_delivery_zones_radius on public.delivery_zones (max_distance_km asc);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  queue_seq bigint not null unique,
  queue_number text not null unique,
  idempotency_key text not null unique,
  payload_hash text not null,
  receipt_token_hash text not null,
  customer_name text not null,
  contact_number text not null default '',
  fulfillment text not null check (fulfillment in ('kiosk-pickup', 'delivery')),
  delivery_zone_id text references public.delivery_zones (id) on delete set null,
  delivery_zone_name text,
  delivery_eta_minutes text,
  delivery_pin_lat double precision check (
    delivery_pin_lat is null or delivery_pin_lat between -90 and 90
  ),
  delivery_pin_lng double precision check (
    delivery_pin_lng is null or delivery_pin_lng between -180 and 180
  ),
  delivery_distance_km numeric(6, 1) check (
    delivery_distance_km is null or delivery_distance_km >= 0
  ),
  delivery_fee_waived boolean not null default false,
  address_or_notes text not null default '',
  payment_method text not null check (payment_method in ('cash', 'gcash', 'maya')),
  subtotal_php integer not null check (subtotal_php >= 0),
  delivery_fee_php integer not null check (delivery_fee_php >= 0),
  total_php integer not null check (total_php >= 0),
  status text not null default 'received' check (
    status in ('received', 'grilling', 'ready', 'completed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_orders_updated_at
  before update on public.orders
  for each row
  execute function public.set_updated_at();

create index idx_orders_created_desc on public.orders (created_at desc, id desc);
create index idx_orders_status_created_desc on public.orders (status, created_at desc, id desc);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  line_id text not null,
  item_id text not null,
  name text not null,
  unit_price_php integer not null check (unit_price_php >= 0),
  addon_names text[] not null default '{}',
  addons_price_php integer not null check (addons_price_php >= 0),
  quantity integer not null check (quantity > 0),
  line_total_php integer not null check (line_total_php >= 0),
  position integer not null default 0
);

create index idx_order_lines_order_position on public.order_lines (order_id, position asc);

-- Enable Row-Level Security on every table
alter table public.admin_users enable row level security;
alter table public.menu_addons enable row level security;
alter table public.menu_items enable row level security;
alter table public.store_settings enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;

-- admin_users: authenticated user can read only their own membership row
create policy "admin_users_self_select"
  on public.admin_users
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Public read-only catalog & delivery pricing policies
create policy "menu_addons_public_read"
  on public.menu_addons
  for select
  to anon, authenticated
  using (true);

create policy "menu_items_public_read"
  on public.menu_items
  for select
  to anon, authenticated
  using (true);

create policy "store_settings_public_read"
  on public.store_settings
  for select
  to anon, authenticated
  using (true);

create policy "delivery_zones_public_read"
  on public.delivery_zones
  for select
  to anon, authenticated
  using (true);

-- Active Admin write policies on catalog & delivery settings
create policy "menu_items_admin_all"
  on public.menu_items
  for all
  to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

create policy "store_settings_admin_all"
  on public.store_settings
  for all
  to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

create policy "delivery_zones_admin_all"
  on public.delivery_zones
  for all
  to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

-- Orders & Order Lines: strictly zero anon access; active admins only
create policy "orders_admin_select"
  on public.orders
  for select
  to authenticated
  using (public.is_active_admin());

create policy "orders_admin_update"
  on public.orders
  for update
  to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

create policy "order_lines_admin_select"
  on public.order_lines
  for select
  to authenticated
  using (public.is_active_admin());
