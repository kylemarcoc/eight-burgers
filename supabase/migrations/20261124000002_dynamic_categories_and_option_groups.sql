-- Menu Kiosk — Dynamic Categories, Reusable Option Groups & Per-Item Notes
-- Introduces `public.menu_categories`, `public.option_groups`, `public.option_choices`,
-- and `public.menu_item_option_groups`, migrates legacy `menu_addons` into an optional
-- `'add-ons'` group, renames `menu_items.patty_spec` -> `spec_label`, drops `allow_addons`,
-- keeps RBAC column guards synchronized, and updates `place_order` and order JSON builders.

create table public.menu_categories (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(id) <= 80),
  name text not null check (length(trim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 240),
  sort_order integer not null default 0,
  active boolean not null default true,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_menu_categories_sort
  on public.menu_categories (sort_order asc, created_at asc);

create trigger trg_menu_categories_updated_at
  before update on public.menu_categories
  for each row
  execute function public.bump_row_version();

-- Backfill distinct existing categories before switching `menu_items.category` to a FK
insert into public.menu_categories (id, name, description, sort_order, active)
select
  src.category,
  case src.category
    when 'classic-burgers' then 'Classic Burgers'
    when 'specialty-burgers' then 'Specialty Burgers'
    when 'heavyweights' then 'Heavyweights & Sandwiches'
    when 'sides-snacks' then 'Sides & Snacks'
    else initcap(replace(src.category, '-', ' '))
  end,
  case src.category
    when 'classic-burgers' then 'Pure beef griddle staples with crisp garden toppings.'
    when 'specialty-burgers' then 'Signature sauces, salsa, wasabi mayo, taco beef, and grilled pineapple.'
    when 'heavyweights' then 'Double patties, cheesesteaks, and sausage rolls built for big appetites.'
    when 'sides-snacks' then 'Crinkle fries, seasoned potato wedges, and loaded nacho trays.'
    else ''
  end,
  case src.category
    when 'classic-burgers' then 1
    when 'specialty-burgers' then 2
    when 'heavyweights' then 3
    when 'sides-snacks' then 4
    else 100
  end,
  true
from (select distinct category from public.menu_items) as src
on conflict (id) do nothing;

alter table public.menu_items
  drop constraint if exists menu_items_category_check;

alter table public.menu_items
  add constraint menu_items_category_fkey
  foreign key (category)
  references public.menu_categories (id)
  on update cascade
  on delete restrict;

create table public.option_groups (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(id) <= 80),
  name text not null check (length(trim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 240),
  selection_mode text not null default 'multi' check (selection_mode in ('single', 'multi')),
  required boolean not null default false,
  min_select integer not null default 0 check (min_select >= 0),
  max_select integer check (max_select is null or max_select >= 1),
  sort_order integer not null default 0,
  active boolean not null default true,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint option_groups_single_mode_check check (
    selection_mode <> 'single' or max_select = 1
  ),
  constraint option_groups_required_min_check check (
    not required or min_select >= 1
  ),
  constraint option_groups_min_max_check check (
    max_select is null or max_select >= min_select
  )
);

create index idx_option_groups_sort
  on public.option_groups (sort_order asc, created_at asc);

create trigger trg_option_groups_updated_at
  before update on public.option_groups
  for each row
  execute function public.bump_row_version();

create table public.option_choices (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(id) <= 80),
  group_id text not null references public.option_groups (id) on update cascade on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  price_delta_php integer not null default 0 check (price_delta_php >= 0 and price_delta_php <= 100000),
  available boolean not null default true,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_option_choices_group_sort
  on public.option_choices (group_id, sort_order asc, created_at asc);

create trigger trg_option_choices_updated_at
  before update on public.option_choices
  for each row
  execute function public.bump_row_version();

create table public.menu_item_option_groups (
  item_id text not null references public.menu_items (id) on update cascade on delete cascade,
  group_id text not null references public.option_groups (id) on update cascade on delete restrict,
  sort_order integer not null default 0,
  primary key (item_id, group_id)
);

create index idx_menu_item_option_groups_group
  on public.menu_item_option_groups (group_id);

create index idx_menu_item_option_groups_item_sort
  on public.menu_item_option_groups (item_id, sort_order asc);

-- Migrate legacy `public.menu_addons` rows into an optional multi-select `'add-ons'` group
do $$
begin
  if exists (select 1 from public.menu_addons)
     or exists (select 1 from public.menu_items where allow_addons = true)
  then
    insert into public.option_groups (
      id,
      name,
      description,
      selection_mode,
      required,
      min_select,
      max_select,
      sort_order,
      active
    )
    values (
      'add-ons',
      'Add-ons',
      'Optional extras for your order.',
      'multi',
      false,
      0,
      null,
      1,
      true
    )
    on conflict (id) do nothing;

    insert into public.option_choices (
      id,
      group_id,
      name,
      price_delta_php,
      available,
      is_default,
      sort_order
    )
    select
      ma.id,
      'add-ons',
      ma.name,
      ma.price_php,
      true,
      false,
      ma.sort_order
    from public.menu_addons ma
    on conflict (id) do nothing;

    insert into public.menu_item_option_groups (item_id, group_id, sort_order)
    select
      mi.id,
      'add-ons',
      1
    from public.menu_items mi
    where mi.allow_addons = true
    on conflict (item_id, group_id) do nothing;
  end if;
end;
$$;

-- Rename `patty_spec` -> `spec_label`, drop `allow_addons` and legacy `menu_addons`,
-- and synchronize `enforce_menu_item_update_role()` in the same migration.
alter table public.menu_items
  rename column patty_spec to spec_label;

alter table public.menu_items
  drop column if exists allow_addons;

drop table if exists public.menu_addons;

create or replace function public.enforce_menu_item_update_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_owner_admin() then
    if not public.is_active_admin() then
      raise exception 'INSUFFICIENT_ROLE_FOR_MENU_EDIT'
        using errcode = '42501';
    end if;

    if new.id is distinct from old.id
      or new.name is distinct from old.name
      or new.category is distinct from old.category
      or new.price_php is distinct from old.price_php
      or new.spec_label is distinct from old.spec_label
      or new.description is distinct from old.description
      or new.image_url is distinct from old.image_url
      or new.featured is distinct from old.featured
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

-- Row-Level Security on categories, option groups, choices, and item-group links
alter table public.menu_categories enable row level security;
alter table public.option_groups enable row level security;
alter table public.option_choices enable row level security;
alter table public.menu_item_option_groups enable row level security;

create policy "menu_categories_public_read"
  on public.menu_categories
  for select
  to anon, authenticated
  using (true);

create policy "menu_categories_owner_all"
  on public.menu_categories
  for all
  to authenticated
  using (public.is_owner_admin())
  with check (public.is_owner_admin());

create policy "option_groups_public_read"
  on public.option_groups
  for select
  to anon, authenticated
  using (true);

create policy "option_groups_owner_all"
  on public.option_groups
  for all
  to authenticated
  using (public.is_owner_admin())
  with check (public.is_owner_admin());

create policy "menu_item_option_groups_public_read"
  on public.menu_item_option_groups
  for select
  to anon, authenticated
  using (true);

create policy "menu_item_option_groups_owner_all"
  on public.menu_item_option_groups
  for all
  to authenticated
  using (public.is_owner_admin())
  with check (public.is_owner_admin());

create policy "option_choices_public_read"
  on public.option_choices
  for select
  to anon, authenticated
  using (true);

create policy "option_choices_owner_insert"
  on public.option_choices
  for insert
  to authenticated
  with check (public.is_owner_admin());

create policy "option_choices_owner_delete"
  on public.option_choices
  for delete
  to authenticated
  using (public.is_owner_admin());

create policy "option_choices_admin_update"
  on public.option_choices
  for update
  to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

create or replace function public.enforce_option_choice_update_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_owner_admin() then
    if not public.is_active_admin() then
      raise exception 'INSUFFICIENT_ROLE_FOR_OPTION_CHOICE_EDIT'
        using errcode = '42501';
    end if;

    if new.id is distinct from old.id
      or new.group_id is distinct from old.group_id
      or new.name is distinct from old.name
      or new.price_delta_php is distinct from old.price_delta_php
      or new.is_default is distinct from old.is_default
      or new.sort_order is distinct from old.sort_order
      or new.created_at is distinct from old.created_at
    then
      raise exception 'INSUFFICIENT_ROLE_FOR_OPTION_CHOICE_EDIT'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_option_choices_01_role_guard on public.option_choices;
create trigger trg_option_choices_01_role_guard
  before update on public.option_choices
  for each row
  execute function public.enforce_option_choice_update_role();

-- Snapshot selected options and per-item special notes on order_lines
alter table public.order_lines
  add column if not exists selected_options jsonb not null default '[]'::jsonb check (
    jsonb_typeof(selected_options) = 'array'
  ),
  add column if not exists item_note text not null default '' check (length(item_note) <= 140);

create or replace function public.build_order_json(p_order_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_lines jsonb;
  v_result jsonb;
begin
  select *
  into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'lineId', ol.line_id,
        'itemId', ol.item_id,
        'name', ol.name,
        'unitPricePhp', ol.unit_price_php,
        'selectedOptions', ol.selected_options,
        'addonNames', to_jsonb(ol.addon_names),
        'itemNote', ol.item_note,
        'addonsPricePhp', ol.addons_price_php,
        'quantity', ol.quantity,
        'lineTotalPhp', ol.line_total_php
      )
      order by ol.position asc
    ),
    '[]'::jsonb
  )
  into v_lines
  from public.order_lines ol
  where ol.order_id = v_order.id;

  v_result := jsonb_build_object(
    'id', v_order.id::text,
    'queueNumber', v_order.queue_number,
    'customerName', v_order.customer_name,
    'contactNumber', v_order.contact_number,
    'fulfillment', v_order.fulfillment,
    'addressOrNotes', v_order.address_or_notes,
    'paymentMethod', v_order.payment_method,
    'lines', v_lines,
    'subtotalPhp', v_order.subtotal_php,
    'deliveryFeePhp', v_order.delivery_fee_php,
    'totalPhp', v_order.total_php,
    'status', v_order.status,
    'createdAtIso', to_char(v_order.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', to_char(v_order.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'version', v_order.version
  );

  if v_order.delivery_eta_minutes is not null then
    v_result := v_result || jsonb_build_object('deliveryEtaMinutes', v_order.delivery_eta_minutes);
  end if;
  if v_order.delivery_pin_lat is not null and v_order.delivery_pin_lng is not null then
    v_result := v_result || jsonb_build_object(
      'deliveryPin',
      jsonb_build_object('lat', v_order.delivery_pin_lat, 'lng', v_order.delivery_pin_lng)
    );
  end if;
  if v_order.delivery_distance_km is not null then
    v_result := v_result || jsonb_build_object('deliveryDistanceKm', v_order.delivery_distance_km::double precision);
  end if;
  if v_order.delivery_fee_waived then
    v_result := v_result || jsonb_build_object('deliveryFeeWaived', true);
  end if;

  return v_result;
end;
$$;

-- Privacy-safe public queue tracker: includes option choice names while omitting free-text `itemNote`
create or replace function public.build_public_order_tracker_json(p_order_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_lines jsonb;
  v_result jsonb;
begin
  select *
  into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'lineId', ol.line_id,
        'name', ol.name,
        'quantity', ol.quantity,
        'addonNames', to_jsonb(ol.addon_names),
        'selectedOptionNames', to_jsonb(ol.addon_names)
      )
      order by ol.position asc
    ),
    '[]'::jsonb
  )
  into v_lines
  from public.order_lines ol
  where ol.order_id = v_order.id;

  v_result := jsonb_build_object(
    'queueNumber', v_order.queue_number,
    'fulfillment', v_order.fulfillment,
    'lines', v_lines,
    'status', v_order.status,
    'createdAtIso', to_char(v_order.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', to_char(v_order.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  if v_order.delivery_eta_minutes is not null then
    v_result := v_result || jsonb_build_object('deliveryEtaMinutes', v_order.delivery_eta_minutes);
  end if;

  return v_result;
end;
$$;

create or replace function public.place_order(
  p_idempotency_key text,
  p_payload_hash text,
  p_receipt_token_hash text,
  p_customer_name text,
  p_contact_number text,
  p_fulfillment text,
  p_delivery_pin_lat double precision,
  p_delivery_pin_lng double precision,
  p_address_or_notes text,
  p_payment_method text,
  p_items jsonb,
  p_expected_total_php integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.orders%rowtype;
  v_settings public.store_settings%rowtype;
  v_has_settings boolean := false;
  v_item_row public.menu_items%rowtype;
  v_elem jsonb;
  v_item_id text;
  v_qty integer;
  v_item_note text;
  v_options_json jsonb;
  v_req_option_ids text[];
  v_bad_option_id text;
  v_unavail_option_id text;
  v_group_rec record;
  v_group_count integer;
  v_effective_min integer;
  v_effective_max integer;
  v_selected_ids text[];
  v_addon_names text[];
  v_selected_options jsonb;
  v_addons_price integer;
  v_line_id text;
  v_line_total integer;
  v_subtotal integer := 0;
  v_base_fee integer := 0;
  v_delivery_fee integer := 0;
  v_delivery_fee_waived boolean := false;
  v_distance_km numeric(6, 1) := null;
  v_eta_minutes text := null;
  v_total integer := 0;
  v_queue_seq bigint;
  v_queue_number text;
  v_order_id uuid;
  v_pos integer := 0;
  v_lines_payload jsonb := '[]'::jsonb;
  v_line_entry jsonb;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = 'P0001';
  end if;

  -- Check for idempotent replay before mutating state
  select *
  into v_existing
  from public.orders
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.payload_hash <> p_payload_hash then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'replayed', true,
      'order', public.build_order_json(v_existing.id)
    );
  end if;

  select *
  into v_settings
  from public.store_settings
  where id = 1;
  v_has_settings := found;

  if v_has_settings and not v_settings.accepting_orders then
    raise exception 'STORE_CLOSED' using errcode = 'P0001';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_ORDER' using errcode = 'P0001';
  end if;

  -- Validate every line item, linked option groups, and calculate authoritative subtotal
  for v_elem in select * from jsonb_array_elements(p_items)
  loop
    v_item_id := trim(coalesce(v_elem ->> 'itemId', ''));
    v_qty := coalesce((v_elem ->> 'quantity')::integer, 0);
    v_item_note := trim(coalesce(v_elem ->> 'itemNote', ''));

    if v_item_id = '' or v_qty < 1 or v_qty > 50 or length(v_item_note) > 140 then
      raise exception 'INVALID_LINE_ITEM' using errcode = 'P0001';
    end if;

    select *
    into v_item_row
    from public.menu_items
    where id = v_item_id;

    if not found or not v_item_row.available then
      raise exception 'ITEM_UNAVAILABLE:%', v_item_id using errcode = 'P0001';
    end if;

    v_options_json := coalesce(v_elem -> 'selectedOptionIds', '[]'::jsonb);
    if jsonb_typeof(v_options_json) <> 'array' then
      raise exception 'INVALID_OPTION_SELECTION' using errcode = 'P0001';
    end if;

    select coalesce(array_agg(distinct trim(opt_id)), '{}')
    into v_req_option_ids
    from jsonb_array_elements_text(v_options_json) as opt_id
    where trim(opt_id) <> '';

    -- Reject any option ID not linked to an active option group on this item
    select req.opt_id
    into v_bad_option_id
    from unnest(v_req_option_ids) as req(opt_id)
    where not exists (
      select 1
      from public.option_choices oc
      join public.option_groups og on og.id = oc.group_id
      join public.menu_item_option_groups miog on miog.group_id = og.id
      where miog.item_id = v_item_row.id
        and og.active = true
        and oc.id = req.opt_id
    )
    limit 1;

    if v_bad_option_id is not null then
      raise exception 'INVALID_OPTION_SELECTION:%', v_bad_option_id using errcode = 'P0001';
    end if;

    -- Reject any requested choice that is currently unavailable
    select oc.id
    into v_unavail_option_id
    from public.option_choices oc
    join public.option_groups og on og.id = oc.group_id
    join public.menu_item_option_groups miog on miog.group_id = og.id
    where miog.item_id = v_item_row.id
      and og.active = true
      and oc.id = any(v_req_option_ids)
      and oc.available = false
    limit 1;

    if v_unavail_option_id is not null then
      raise exception 'OPTION_UNAVAILABLE:%', v_unavail_option_id using errcode = 'P0001';
    end if;

    -- Enforce required / min_select / max_select invariants per active linked group
    for v_group_rec in
      select og.id, og.selection_mode, og.required, og.min_select, og.max_select
      from public.menu_item_option_groups miog
      join public.option_groups og on og.id = miog.group_id
      where miog.item_id = v_item_row.id
        and og.active = true
      order by miog.sort_order asc, og.sort_order asc, og.id asc
    loop
      select count(*)::integer
      into v_group_count
      from public.option_choices oc
      where oc.group_id = v_group_rec.id
        and oc.id = any(v_req_option_ids);

      v_effective_min := case
        when v_group_rec.required then greatest(1, v_group_rec.min_select)
        else v_group_rec.min_select
      end;
      v_effective_max := case
        when v_group_rec.selection_mode = 'single' then 1
        else v_group_rec.max_select
      end;

      if v_group_count < v_effective_min then
        raise exception 'REQUIRED_OPTION_MISSING:%', v_group_rec.id using errcode = 'P0001';
      end if;

      if v_effective_max is not null and v_group_count > v_effective_max then
        raise exception 'OPTION_LIMIT_EXCEEDED:%', v_group_rec.id using errcode = 'P0001';
      end if;
    end loop;

    select
      coalesce(array_agg(oc.id order by oc.id asc), '{}'),
      coalesce(
        array_agg(oc.name order by miog.sort_order asc, og.sort_order asc, oc.sort_order asc, oc.id asc),
        '{}'
      ),
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'groupId', og.id,
            'groupName', og.name,
            'choiceId', oc.id,
            'choiceName', oc.name,
            'priceDeltaPhp', oc.price_delta_php
          )
          order by miog.sort_order asc, og.sort_order asc, oc.sort_order asc, oc.id asc
        ),
        '[]'::jsonb
      ),
      coalesce(sum(oc.price_delta_php), 0)::integer
    into v_selected_ids, v_addon_names, v_selected_options, v_addons_price
    from public.option_choices oc
    join public.option_groups og on og.id = oc.group_id
    join public.menu_item_option_groups miog on miog.group_id = og.id
    where miog.item_id = v_item_row.id
      and og.active = true
      and oc.id = any(v_req_option_ids);

    if array_length(v_selected_ids, 1) is null then
      v_line_id := v_item_row.id;
    else
      v_line_id := v_item_row.id || '__' || array_to_string(v_selected_ids, '+');
    end if;

    if v_item_note <> '' then
      v_line_id := v_line_id || '~' || substr(md5(v_item_note), 1, 8);
    end if;

    v_line_total := (v_item_row.price_php + v_addons_price) * v_qty;
    v_subtotal := v_subtotal + v_line_total;

    v_lines_payload := v_lines_payload || jsonb_build_array(
      jsonb_build_object(
        'lineId', v_line_id,
        'itemId', v_item_row.id,
        'name', v_item_row.name,
        'unitPricePhp', v_item_row.price_php,
        'selectedOptions', v_selected_options,
        'addonNames', to_jsonb(v_addon_names),
        'itemNote', v_item_note,
        'addonsPricePhp', v_addons_price,
        'quantity', v_qty,
        'lineTotalPhp', v_line_total,
        'position', v_pos
      )
    );
    v_pos := v_pos + 1;
  end loop;

  -- Resolve distance-formula delivery pricing server-side
  if p_fulfillment = 'delivery' then
    if not v_has_settings
      or not v_settings.delivery_enabled
      or v_settings.origin_lat is null
      or v_settings.origin_lng is null
    then
      raise exception 'DELIVERY_UNAVAILABLE' using errcode = 'P0001';
    end if;

    if p_delivery_pin_lat is null or p_delivery_pin_lng is null then
      raise exception 'DELIVERY_PIN_REQUIRED' using errcode = 'P0001';
    end if;

    v_distance_km := public.estimate_road_distance_km(
      v_settings.origin_lat,
      v_settings.origin_lng,
      p_delivery_pin_lat,
      p_delivery_pin_lng
    );

    if v_distance_km > v_settings.delivery_max_distance_km then
      raise exception 'OUT_OF_DELIVERY_RANGE' using errcode = 'P0001';
    end if;

    v_base_fee := public.estimate_delivery_fee_php(
      v_distance_km,
      v_settings.delivery_base_fee_php,
      v_settings.delivery_per_km_rate_php
    );
    v_eta_minutes := public.estimate_delivery_eta_minutes(v_distance_km);

    if v_settings.free_delivery_min_subtotal_php is not null
      and v_subtotal >= v_settings.free_delivery_min_subtotal_php
      and v_base_fee > 0
    then
      v_delivery_fee_waived := true;
      v_delivery_fee := 0;
    else
      v_delivery_fee_waived := false;
      v_delivery_fee := v_base_fee;
    end if;
  end if;

  v_total := v_subtotal + v_delivery_fee;

  if p_expected_total_php is not null and p_expected_total_php <> v_total then
    raise exception 'PRICE_CHANGED:%', v_total using errcode = 'P0001';
  end if;

  -- Mint queue sequence LAST so failed checkouts do not burn queue numbers
  v_queue_seq := nextval('public.order_queue_seq');
  v_queue_number :=
    '#' || coalesce(nullif(v_settings.queue_prefix, ''), 'ORD') || '-' || v_queue_seq::text;

  begin
    insert into public.orders (
      queue_seq,
      queue_number,
      idempotency_key,
      payload_hash,
      receipt_token_hash,
      customer_name,
      contact_number,
      fulfillment,
      delivery_zone_id,
      delivery_zone_name,
      delivery_eta_minutes,
      delivery_pin_lat,
      delivery_pin_lng,
      delivery_distance_km,
      delivery_fee_waived,
      address_or_notes,
      payment_method,
      subtotal_php,
      delivery_fee_php,
      total_php,
      status
    )
    values (
      v_queue_seq,
      v_queue_number,
      p_idempotency_key,
      p_payload_hash,
      p_receipt_token_hash,
      coalesce(nullif(trim(p_customer_name), ''), 'Walk-in Guest'),
      coalesce(trim(p_contact_number), ''),
      p_fulfillment,
      null,
      null,
      case when p_fulfillment = 'delivery' then v_eta_minutes else null end,
      case when p_fulfillment = 'delivery' then p_delivery_pin_lat else null end,
      case when p_fulfillment = 'delivery' then p_delivery_pin_lng else null end,
      case when p_fulfillment = 'delivery' then v_distance_km else null end,
      case when p_fulfillment = 'delivery' then v_delivery_fee_waived else false end,
      coalesce(trim(p_address_or_notes), ''),
      p_payment_method,
      v_subtotal,
      v_delivery_fee,
      v_total,
      'received'
    )
    returning id into v_order_id;
  exception
    when unique_violation then
      select *
      into v_existing
      from public.orders
      where idempotency_key = p_idempotency_key;

      if found then
        if v_existing.payload_hash <> p_payload_hash then
          raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
        end if;
        return jsonb_build_object(
          'replayed', true,
          'order', public.build_order_json(v_existing.id)
        );
      end if;
      raise;
  end;

  for v_line_entry in select * from jsonb_array_elements(v_lines_payload)
  loop
    insert into public.order_lines (
      order_id,
      line_id,
      item_id,
      name,
      unit_price_php,
      selected_options,
      addon_names,
      item_note,
      addons_price_php,
      quantity,
      line_total_php,
      position
    )
    values (
      v_order_id,
      v_line_entry ->> 'lineId',
      v_line_entry ->> 'itemId',
      v_line_entry ->> 'name',
      (v_line_entry ->> 'unitPricePhp')::integer,
      coalesce(v_line_entry -> 'selectedOptions', '[]'::jsonb),
      coalesce(
        array(select jsonb_array_elements_text(v_line_entry -> 'addonNames')),
        '{}'
      ),
      coalesce(v_line_entry ->> 'itemNote', ''),
      (v_line_entry ->> 'addonsPricePhp')::integer,
      (v_line_entry ->> 'quantity')::integer,
      (v_line_entry ->> 'lineTotalPhp')::integer,
      (v_line_entry ->> 'position')::integer
    );
  end loop;

  return jsonb_build_object(
    'replayed', false,
    'order', public.build_order_json(v_order_id)
  );
end;
$$;

-- Least-privilege execution grants: callable strictly by backend BFF (service_role)
revoke all on function public.build_order_json(uuid) from public, anon, authenticated;
grant execute on function public.build_order_json(uuid) to service_role;

revoke all on function public.build_public_order_tracker_json(uuid) from public, anon, authenticated;
grant execute on function public.build_public_order_tracker_json(uuid) to service_role;

revoke all on function public.place_order(
  text,
  text,
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  text,
  text,
  jsonb,
  integer
) from public, anon, authenticated;
grant execute on function public.place_order(
  text,
  text,
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  text,
  text,
  jsonb,
  integer
) to service_role;
