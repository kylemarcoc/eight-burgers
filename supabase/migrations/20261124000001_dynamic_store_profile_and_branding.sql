-- Menu Kiosk — Dynamic Store Profile, Branding, Theme, Shop Pin & Accepting Orders
-- Expands `public.store_settings` with white-label identity, branding, theme,
-- nullable shop origin coordinates, and order-availability columns, adds column-level
-- Owner/Cashier RBAC on `public.store_settings`, and updates `public.place_order` to
-- enforce `accepting_orders`, nullable origin pins, and dynamic queue prefixes.

alter table public.store_settings
  add column if not exists store_name text not null default 'Your Shop' check (length(trim(store_name)) between 1 and 80),
  add column if not exists branch_label text not null default '' check (length(branch_label) <= 120),
  add column if not exists monogram text not null default 'SH' check (monogram ~ '^[A-Za-z0-9]{1,3}$'),
  add column if not exists hero_headline text not null default 'Freshly made to order.' check (length(hero_headline) <= 160),
  add column if not exists hero_subtext text not null default '' check (length(hero_subtext) <= 280),
  add column if not exists hero_badge_label text not null default '' check (length(hero_badge_label) <= 80),
  add column if not exists address text not null default '' check (length(address) <= 240),
  add column if not exists landmark text not null default '' check (length(landmark) <= 200),
  add column if not exists contact_phone text not null default '' check (length(contact_phone) <= 40),
  add column if not exists hours_text text not null default '' check (length(hours_text) <= 120),
  add column if not exists pickup_spot_label text not null default 'Counter Pickup' check (length(pickup_spot_label) <= 80),
  add column if not exists logo_url text not null default '' check (length(logo_url) <= 500),
  add column if not exists hero_image_url text not null default '' check (length(hero_image_url) <= 500),
  add column if not exists external_links jsonb not null default '[]'::jsonb check (jsonb_typeof(external_links) = 'array'),
  add column if not exists queue_prefix text not null default 'ORD' check (queue_prefix ~ '^[A-Z0-9]{2,4}$'),
  add column if not exists preparing_stage_label text not null default 'Preparing' check (length(trim(preparing_stage_label)) between 1 and 40),
  add column if not exists theme_accent_preset text not null default 'ember' check (
    theme_accent_preset in ('ember', 'espresso', 'matcha', 'berry', 'ocean', 'charcoal', 'custom')
  ),
  add column if not exists theme_accent_hex text check (
    theme_accent_hex is null or theme_accent_hex ~ '^#[0-9A-Fa-f]{6}$'
  ),
  add column if not exists accepting_orders boolean not null default true,
  add column if not exists closed_notice text not null default '' check (length(closed_notice) <= 200);

alter table public.store_settings
  alter column origin_lat drop not null,
  alter column origin_lat drop default,
  alter column origin_lng drop not null,
  alter column origin_lng drop default,
  add constraint store_settings_origin_pair_check check (
    (origin_lat is null and origin_lng is null)
    or (origin_lat is not null and origin_lng is not null)
  ),
  add constraint store_settings_delivery_requires_origin_check check (
    not delivery_enabled or (origin_lat is not null and origin_lng is not null)
  );

-- Store settings RLS: Owner can insert/delete/update all columns; Cashier can update
-- only `accepting_orders` and `closed_notice`; Staff is denied writes.
drop policy if exists "store_settings_owner_all" on public.store_settings;
drop policy if exists "store_settings_owner_insert" on public.store_settings;
drop policy if exists "store_settings_owner_delete" on public.store_settings;
drop policy if exists "store_settings_owner_cashier_update" on public.store_settings;

create policy "store_settings_owner_insert"
  on public.store_settings
  for insert
  to authenticated
  with check (public.is_owner_admin());

create policy "store_settings_owner_delete"
  on public.store_settings
  for delete
  to authenticated
  using (public.is_owner_admin());

create policy "store_settings_owner_cashier_update"
  on public.store_settings
  for update
  to authenticated
  using (public.has_admin_role(array['owner', 'cashier']))
  with check (public.has_admin_role(array['owner', 'cashier']));

create or replace function public.enforce_store_settings_update_role()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    return new;
  end if;

  v_role := public.active_admin_role();

  if v_role = 'owner' then
    return new;
  end if;

  if v_role = 'cashier' then
    if new.id is distinct from old.id
      or new.free_delivery_min_subtotal_php is distinct from old.free_delivery_min_subtotal_php
      or new.origin_lat is distinct from old.origin_lat
      or new.origin_lng is distinct from old.origin_lng
      or new.delivery_enabled is distinct from old.delivery_enabled
      or new.delivery_base_fee_php is distinct from old.delivery_base_fee_php
      or new.delivery_per_km_rate_php is distinct from old.delivery_per_km_rate_php
      or new.delivery_max_distance_km is distinct from old.delivery_max_distance_km
      or new.store_name is distinct from old.store_name
      or new.branch_label is distinct from old.branch_label
      or new.monogram is distinct from old.monogram
      or new.hero_headline is distinct from old.hero_headline
      or new.hero_subtext is distinct from old.hero_subtext
      or new.hero_badge_label is distinct from old.hero_badge_label
      or new.address is distinct from old.address
      or new.landmark is distinct from old.landmark
      or new.contact_phone is distinct from old.contact_phone
      or new.hours_text is distinct from old.hours_text
      or new.pickup_spot_label is distinct from old.pickup_spot_label
      or new.logo_url is distinct from old.logo_url
      or new.hero_image_url is distinct from old.hero_image_url
      or new.external_links is distinct from old.external_links
      or new.queue_prefix is distinct from old.queue_prefix
      or new.preparing_stage_label is distinct from old.preparing_stage_label
      or new.theme_accent_preset is distinct from old.theme_accent_preset
      or new.theme_accent_hex is distinct from old.theme_accent_hex
    then
      raise exception 'INSUFFICIENT_ROLE_FOR_STORE_SETTINGS_EDIT'
        using errcode = '42501';
    end if;

    return new;
  end if;

  raise exception 'INSUFFICIENT_ROLE_FOR_STORE_SETTINGS_EDIT'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_store_settings_01_role_guard on public.store_settings;
create trigger trg_store_settings_01_role_guard
  before update on public.store_settings
  for each row
  execute function public.enforce_store_settings_update_role();

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
  v_addon_ids text[];
  v_addon_names text[];
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

  -- Validate every line item and calculate authoritative subtotal
  for v_elem in select * from jsonb_array_elements(p_items)
  loop
    v_item_id := trim(coalesce(v_elem ->> 'itemId', ''));
    v_qty := coalesce((v_elem ->> 'quantity')::integer, 0);

    if v_item_id = '' or v_qty < 1 or v_qty > 50 then
      raise exception 'INVALID_LINE_ITEM' using errcode = 'P0001';
    end if;

    select *
    into v_item_row
    from public.menu_items
    where id = v_item_id;

    if not found or not v_item_row.available then
      raise exception 'ITEM_UNAVAILABLE:%', v_item_id using errcode = 'P0001';
    end if;

    v_addon_ids := '{}';
    v_addon_names := '{}';
    v_addons_price := 0;

    if v_item_row.allow_addons and jsonb_typeof(v_elem -> 'addonIds') = 'array' then
      select
        coalesce(array_agg(ma.id order by ma.id asc), '{}'),
        coalesce(array_agg(ma.name order by ma.id asc), '{}'),
        coalesce(sum(ma.price_php), 0)::integer
      into v_addon_ids, v_addon_names, v_addons_price
      from (
        select distinct jsonb_array_elements_text(v_elem -> 'addonIds') as addon_id
      ) req_addons
      join public.menu_addons ma on ma.id = req_addons.addon_id;
    end if;

    if array_length(v_addon_ids, 1) is null then
      v_line_id := v_item_row.id;
    else
      v_line_id := v_item_row.id || '__' || array_to_string(v_addon_ids, '+');
    end if;

    v_line_total := (v_item_row.price_php + v_addons_price) * v_qty;
    v_subtotal := v_subtotal + v_line_total;

    v_lines_payload := v_lines_payload || jsonb_build_array(
      jsonb_build_object(
        'lineId', v_line_id,
        'itemId', v_item_row.id,
        'name', v_item_row.name,
        'unitPricePhp', v_item_row.price_php,
        'addonNames', to_jsonb(v_addon_names),
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
      addon_names,
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
      coalesce(
        array(select jsonb_array_elements_text(v_line_entry -> 'addonNames')),
        '{}'
      ),
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
