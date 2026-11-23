-- Menu Kiosk — Transactional Demo Catalog Reset RPC
-- Replaces multi-step DELETE + INSERT catalog resets with a single atomic UPSERT
-- transaction so there is zero empty-catalog window and FK invariants always hold.

create or replace function public.reset_demo_catalog(
  p_categories jsonb,
  p_option_groups jsonb,
  p_option_choices jsonb,
  p_menu_items jsonb,
  p_item_option_groups jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_upserted_item_ids text[] := array[]::text[];
  v_item_count integer := 0;
begin
  if p_categories is null or jsonb_typeof(p_categories) <> 'array'
    or p_option_groups is null or jsonb_typeof(p_option_groups) <> 'array'
    or p_option_choices is null or jsonb_typeof(p_option_choices) <> 'array'
    or p_menu_items is null or jsonb_typeof(p_menu_items) <> 'array'
    or p_item_option_groups is null or jsonb_typeof(p_item_option_groups) <> 'array'
  then
    raise exception 'INVALID_DEMO_CATALOG_PAYLOAD' using errcode = 'P0001';
  end if;

  -- 1. Upsert categories first so menu_items.category FK always resolves
  insert into public.menu_categories (
    id,
    name,
    description,
    sort_order,
    active
  )
  select
    trim(elem ->> 'id'),
    trim(elem ->> 'name'),
    coalesce(elem ->> 'description', ''),
    coalesce((elem ->> 'sortOrder')::integer, 0),
    coalesce((elem ->> 'active')::boolean, true)
  from jsonb_array_elements(p_categories) as elem
  on conflict (id) do update
  set
    name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    active = excluded.active;

  -- 2. Upsert option groups
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
  select
    trim(elem ->> 'id'),
    trim(elem ->> 'name'),
    coalesce(elem ->> 'description', ''),
    coalesce(elem ->> 'selectionMode', 'multi'),
    coalesce((elem ->> 'required')::boolean, false),
    coalesce((elem ->> 'minSelect')::integer, 0),
    case
      when elem -> 'maxSelect' is null or elem -> 'maxSelect' = 'null'::jsonb then null
      else (elem ->> 'maxSelect')::integer
    end,
    coalesce((elem ->> 'sortOrder')::integer, 0),
    coalesce((elem ->> 'active')::boolean, true)
  from jsonb_array_elements(p_option_groups) as elem
  on conflict (id) do update
  set
    name = excluded.name,
    description = excluded.description,
    selection_mode = excluded.selection_mode,
    required = excluded.required,
    min_select = excluded.min_select,
    max_select = excluded.max_select,
    sort_order = excluded.sort_order,
    active = excluded.active;

  -- 3. Upsert option choices
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
    trim(elem ->> 'id'),
    trim(elem ->> 'groupId'),
    trim(elem ->> 'name'),
    coalesce((elem ->> 'priceDeltaPhp')::integer, 0),
    coalesce((elem ->> 'available')::boolean, true),
    coalesce((elem ->> 'isDefault')::boolean, false),
    coalesce((elem ->> 'sortOrder')::integer, 0)
  from jsonb_array_elements(p_option_choices) as elem
  on conflict (id) do update
  set
    group_id = excluded.group_id,
    name = excluded.name,
    price_delta_php = excluded.price_delta_php,
    available = excluded.available,
    is_default = excluded.is_default,
    sort_order = excluded.sort_order;

  -- 4. Upsert baseline menu items BEFORE removing non-baseline items (zero empty-catalog window)
  insert into public.menu_items (
    id,
    name,
    category,
    price_php,
    spec_label,
    description,
    image_url,
    available,
    featured,
    sort_order
  )
  select
    trim(elem ->> 'id'),
    trim(elem ->> 'name'),
    trim(elem ->> 'category'),
    (elem ->> 'pricePhp')::integer,
    coalesce(elem ->> 'specLabel', ''),
    coalesce(elem ->> 'description', ''),
    coalesce(elem ->> 'imageUrl', ''),
    coalesce((elem ->> 'available')::boolean, true),
    coalesce((elem ->> 'featured')::boolean, false),
    coalesce((elem ->> 'sortOrder')::integer, 0)
  from jsonb_array_elements(p_menu_items) as elem
  on conflict (id) do update
  set
    name = excluded.name,
    category = excluded.category,
    price_php = excluded.price_php,
    spec_label = excluded.spec_label,
    description = excluded.description,
    image_url = excluded.image_url,
    available = excluded.available,
    featured = excluded.featured,
    sort_order = excluded.sort_order;

  select coalesce(array_agg(trim(elem ->> 'id')), array[]::text[])
  into v_upserted_item_ids
  from jsonb_array_elements(p_menu_items) as elem;

  -- 5. Selectively prune non-baseline menu items (cascades their menu_item_option_groups links)
  if array_length(v_upserted_item_ids, 1) is null then
    delete from public.menu_items;
  else
    delete from public.menu_items
    where not (id = any(v_upserted_item_ids));
  end if;

  -- 6. Replace menu_item_option_groups links for the upserted items atomically
  if array_length(v_upserted_item_ids, 1) is not null then
    delete from public.menu_item_option_groups
    where item_id = any(v_upserted_item_ids);
  end if;

  insert into public.menu_item_option_groups (
    item_id,
    group_id,
    sort_order
  )
  select
    trim(elem ->> 'itemId'),
    trim(elem ->> 'groupId'),
    coalesce((elem ->> 'sortOrder')::integer, 0)
  from jsonb_array_elements(p_item_option_groups) as elem
  on conflict (item_id, group_id) do update
  set sort_order = excluded.sort_order;

  v_item_count := coalesce(array_length(v_upserted_item_ids, 1), 0);
  return v_item_count;
end;
$$;

-- Least-privilege execution grant: callable strictly by backend BFF (service_role)
revoke all on function public.reset_demo_catalog(jsonb, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.reset_demo_catalog(jsonb, jsonb, jsonb, jsonb, jsonb)
  to service_role;
