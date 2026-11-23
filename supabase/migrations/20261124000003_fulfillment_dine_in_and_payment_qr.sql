-- Menu Kiosk — Configurable Fulfillment, Dine-in Table QR & Payment Verification
-- Extends `public.store_settings` with pickup/dine-in toggles and payment method configs,
-- migrates `public.orders` enums (`kiosk-pickup` -> `pickup`, `grilling` -> `preparing`),
-- adds `table_number`, `payment_status`, and `payment_reference` with `trg_orders_01_role_guard`,
-- and adds/updates `place_order`, `submit_payment_reference_by_receipt`, cancellation guards,
-- `get_admin_order_stage_counts`, and order JSON builders.

alter table public.store_settings
  add column if not exists pickup_enabled boolean not null default true,
  add column if not exists dine_in_enabled boolean not null default false,
  add column if not exists dine_in_table_required boolean not null default true,
  add column if not exists payment_methods jsonb not null default '{
    "cash": {
      "enabled": true,
      "label": "Cash",
      "accountName": "",
      "accountNumber": "",
      "instructions": "Pay upon pickup, delivery, or at the counter.",
      "qrImageUrl": ""
    },
    "gcash": {
      "enabled": false,
      "label": "GCash",
      "accountName": "",
      "accountNumber": "",
      "instructions": "",
      "qrImageUrl": ""
    },
    "maya": {
      "enabled": false,
      "label": "Maya",
      "accountName": "",
      "accountNumber": "",
      "instructions": "",
      "qrImageUrl": ""
    },
    "bank_transfer": {
      "enabled": false,
      "label": "Bank Transfer",
      "accountName": "",
      "accountNumber": "",
      "instructions": "",
      "qrImageUrl": ""
    }
  }'::jsonb;

alter table public.store_settings
  drop constraint if exists store_settings_fulfillment_enabled_check,
  drop constraint if exists store_settings_payment_methods_shape_check;

alter table public.store_settings
  add constraint store_settings_fulfillment_enabled_check check (
    pickup_enabled or delivery_enabled or dine_in_enabled
  ),
  add constraint store_settings_payment_methods_shape_check check (
    jsonb_typeof(payment_methods) = 'object'
    and jsonb_typeof(payment_methods -> 'cash') = 'object'
    and jsonb_typeof(payment_methods -> 'gcash') = 'object'
    and jsonb_typeof(payment_methods -> 'maya') = 'object'
    and jsonb_typeof(payment_methods -> 'bank_transfer') = 'object'
    and (
      coalesce((payment_methods -> 'cash' ->> 'enabled')::boolean, false)
      or coalesce((payment_methods -> 'gcash' ->> 'enabled')::boolean, false)
      or coalesce((payment_methods -> 'maya' ->> 'enabled')::boolean, false)
      or coalesce((payment_methods -> 'bank_transfer' ->> 'enabled')::boolean, false)
    )
  );

-- Synchronize `enforce_store_settings_update_role()` so the new fulfillment and payment
-- columns remain Owner-only while Cashier continues to manage only `accepting_orders` & `closed_notice`.
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
      or new.pickup_enabled is distinct from old.pickup_enabled
      or new.dine_in_enabled is distinct from old.dine_in_enabled
      or new.dine_in_table_required is distinct from old.dine_in_table_required
      or new.payment_methods is distinct from old.payment_methods
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

-- Migrate `public.orders` enums (`kiosk-pickup` -> `pickup`, `grilling` -> `preparing`)
-- and add dine-in table & payment verification columns.
alter table public.orders
  drop constraint if exists orders_fulfillment_check,
  drop constraint if exists orders_payment_method_check,
  drop constraint if exists orders_payment_status_check,
  drop constraint if exists orders_status_check;

update public.orders
set fulfillment = 'pickup'
where fulfillment = 'kiosk-pickup';

update public.orders
set status = 'preparing'
where status = 'grilling';

alter table public.orders
  add column if not exists table_number text not null default '' check (length(table_number) <= 24),
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists payment_reference text not null default '' check (length(payment_reference) <= 80);

alter table public.orders
  add constraint orders_fulfillment_check
    check (fulfillment in ('pickup', 'delivery', 'dine-in')),
  add constraint orders_payment_method_check
    check (payment_method in ('cash', 'gcash', 'maya', 'bank_transfer')),
  add constraint orders_payment_status_check
    check (payment_status in ('unpaid', 'pending_verification', 'paid')),
  add constraint orders_status_check
    check (status in ('received', 'preparing', 'ready', 'completed', 'cancelled'));

create index if not exists idx_orders_payment_status_created_desc
  on public.orders (payment_status, created_at desc, id desc);

-- Column-level RBAC guard on `public.orders` (`01_` runs before `trg_orders_updated_at`):
-- Staff can update `status` only; Owner & Cashier can update `status` and `payment_status`;
-- all financial, customer, fulfillment, and payment_reference columns are immutable via UPDATE.
create or replace function public.enforce_order_update_role()
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

  if v_role is null or v_role not in ('owner', 'cashier', 'staff') then
    raise exception 'INSUFFICIENT_ROLE_FOR_ORDER_EDIT'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id
    or new.queue_seq is distinct from old.queue_seq
    or new.queue_number is distinct from old.queue_number
    or new.idempotency_key is distinct from old.idempotency_key
    or new.payload_hash is distinct from old.payload_hash
    or new.receipt_token_hash is distinct from old.receipt_token_hash
    or new.customer_name is distinct from old.customer_name
    or new.contact_number is distinct from old.contact_number
    or new.fulfillment is distinct from old.fulfillment
    or new.table_number is distinct from old.table_number
    or new.delivery_zone_id is distinct from old.delivery_zone_id
    or new.delivery_zone_name is distinct from old.delivery_zone_name
    or new.delivery_eta_minutes is distinct from old.delivery_eta_minutes
    or new.delivery_pin_lat is distinct from old.delivery_pin_lat
    or new.delivery_pin_lng is distinct from old.delivery_pin_lng
    or new.delivery_distance_km is distinct from old.delivery_distance_km
    or new.delivery_fee_waived is distinct from old.delivery_fee_waived
    or new.address_or_notes is distinct from old.address_or_notes
    or new.payment_method is distinct from old.payment_method
    or new.payment_reference is distinct from old.payment_reference
    or new.subtotal_php is distinct from old.subtotal_php
    or new.delivery_fee_php is distinct from old.delivery_fee_php
    or new.total_php is distinct from old.total_php
    or new.created_at is distinct from old.created_at
  then
    raise exception 'ORDER_FIELDS_IMMUTABLE'
      using errcode = '42501';
  end if;

  if v_role = 'staff' and new.payment_status is distinct from old.payment_status then
    raise exception 'INSUFFICIENT_ROLE_FOR_PAYMENT_STATUS_EDIT'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_01_role_guard on public.orders;
create trigger trg_orders_01_role_guard
  before update on public.orders
  for each row
  execute function public.enforce_order_update_role();

-- Authenticated receipt & Admin order payload builder (includes `tableNumber`, `paymentStatus`, `paymentReference`, `itemNote`)
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
    'tableNumber', v_order.table_number,
    'addressOrNotes', v_order.address_or_notes,
    'paymentMethod', v_order.payment_method,
    'paymentStatus', v_order.payment_status,
    'paymentReference', v_order.payment_reference,
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

-- Privacy-safe public queue tracker: includes option names, `tableNumber`, and `paymentStatus`,
-- while strictly omitting `paymentReference`, `itemNote`, and customer PII.
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
    'tableNumber', v_order.table_number,
    'paymentStatus', v_order.payment_status,
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

-- Replace 12-param `place_order` with 14-param version supporting `p_table_number` & `p_payment_reference`
drop function if exists public.place_order(
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
);

create or replace function public.place_order(
  p_idempotency_key text,
  p_payload_hash text,
  p_receipt_token_hash text,
  p_customer_name text,
  p_contact_number text,
  p_fulfillment text,
  p_table_number text,
  p_delivery_pin_lat double precision,
  p_delivery_pin_lng double precision,
  p_address_or_notes text,
  p_payment_method text,
  p_payment_reference text,
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
  v_customer_name text;
  v_table_number text := '';
  v_payment_reference text := '';
  v_payment_status text := 'unpaid';
  v_payment_enabled boolean := false;
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

  v_customer_name := trim(coalesce(p_customer_name, ''));
  if v_customer_name = '' then
    raise exception 'CUSTOMER_NAME_REQUIRED' using errcode = 'P0001';
  end if;

  -- Validate enabled fulfillment mode and dine-in table requirements
  if p_fulfillment not in ('pickup', 'delivery', 'dine-in') then
    raise exception 'FULFILLMENT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if p_fulfillment = 'pickup' then
    if v_has_settings and not v_settings.pickup_enabled then
      raise exception 'FULFILLMENT_UNAVAILABLE' using errcode = 'P0001';
    end if;
  elsif p_fulfillment = 'dine-in' then
    if not v_has_settings or not v_settings.dine_in_enabled then
      raise exception 'FULFILLMENT_UNAVAILABLE' using errcode = 'P0001';
    end if;
    v_table_number := trim(coalesce(p_table_number, ''));
    if length(v_table_number) > 24 then
      raise exception 'INVALID_TABLE_NUMBER' using errcode = 'P0001';
    end if;
    if v_settings.dine_in_table_required and v_table_number = '' then
      raise exception 'TABLE_NUMBER_REQUIRED' using errcode = 'P0001';
    end if;
  elsif p_fulfillment = 'delivery' then
    if not v_has_settings
      or not v_settings.delivery_enabled
      or v_settings.origin_lat is null
      or v_settings.origin_lng is null
    then
      raise exception 'DELIVERY_UNAVAILABLE' using errcode = 'P0001';
    end if;
  end if;

  -- Validate enabled payment method & initial payment status
  if p_payment_method not in ('cash', 'gcash', 'maya', 'bank_transfer') then
    raise exception 'PAYMENT_METHOD_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if v_has_settings then
    v_payment_enabled := coalesce(
      (v_settings.payment_methods -> p_payment_method ->> 'enabled')::boolean,
      false
    );
  else
    v_payment_enabled := (p_payment_method = 'cash');
  end if;

  if not v_payment_enabled then
    raise exception 'PAYMENT_METHOD_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if p_payment_method <> 'cash' then
    v_payment_reference := trim(coalesce(p_payment_reference, ''));
    if length(v_payment_reference) > 80 then
      raise exception 'INVALID_PAYMENT_REFERENCE' using errcode = 'P0001';
    end if;
    if v_payment_reference <> '' then
      v_payment_status := 'pending_verification';
    end if;
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
      table_number,
      delivery_zone_id,
      delivery_zone_name,
      delivery_eta_minutes,
      delivery_pin_lat,
      delivery_pin_lng,
      delivery_distance_km,
      delivery_fee_waived,
      address_or_notes,
      payment_method,
      payment_status,
      payment_reference,
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
      v_customer_name,
      coalesce(trim(p_contact_number), ''),
      p_fulfillment,
      case when p_fulfillment = 'dine-in' then v_table_number else '' end,
      null,
      null,
      case when p_fulfillment = 'delivery' then v_eta_minutes else null end,
      case when p_fulfillment = 'delivery' then p_delivery_pin_lat else null end,
      case when p_fulfillment = 'delivery' then p_delivery_pin_lng else null end,
      case when p_fulfillment = 'delivery' then v_distance_km else null end,
      case when p_fulfillment = 'delivery' then v_delivery_fee_waived else false end,
      coalesce(trim(p_address_or_notes), ''),
      p_payment_method,
      v_payment_status,
      v_payment_reference,
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

-- Receipt-token authorized payment reference submission & typo correction
create or replace function public.submit_payment_reference_by_receipt(
  p_order_id uuid,
  p_receipt_token_hash text,
  p_payment_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_clean_ref text := trim(coalesce(p_payment_reference, ''));
begin
  select *
  into v_order
  from public.orders
  where id = p_order_id
    and receipt_token_hash = p_receipt_token_hash
  for update;

  if not found then
    return null;
  end if;

  if v_clean_ref = '' or length(v_clean_ref) > 80 then
    return jsonb_build_object(
      'outcome', 'invalid_reference',
      'order', public.build_order_json(v_order.id)
    );
  end if;

  if v_order.payment_method = 'cash' then
    return jsonb_build_object(
      'outcome', 'cash_not_applicable',
      'order', public.build_order_json(v_order.id)
    );
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object(
      'outcome', 'order_cancelled',
      'order', public.build_order_json(v_order.id)
    );
  end if;

  if v_order.payment_status = 'paid' then
    return jsonb_build_object(
      'outcome', 'already_paid',
      'order', public.build_order_json(v_order.id)
    );
  end if;

  update public.orders
  set
    payment_reference = v_clean_ref,
    payment_status = 'pending_verification'
  where id = v_order.id;

  return jsonb_build_object(
    'outcome', 'ok',
    'order', public.build_order_json(v_order.id)
  );
end;
$$;

-- Block customer self-cancellation once payment is submitted/confirmed or order moved past received
create or replace function public.cancel_order_by_receipt(
  p_order_id uuid,
  p_receipt_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  select *
  into v_order
  from public.orders
  where id = p_order_id
    and receipt_token_hash = p_receipt_token_hash
  for update;

  if not found then
    return null;
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object(
      'outcome', 'ok',
      'order', public.build_order_json(v_order.id)
    );
  end if;

  if v_order.status <> 'received'
    or v_order.payment_status in ('pending_verification', 'paid')
  then
    return jsonb_build_object(
      'outcome', 'not_cancellable',
      'order', public.build_order_json(v_order.id)
    );
  end if;

  update public.orders
  set status = 'cancelled'
  where id = v_order.id;

  return jsonb_build_object(
    'outcome', 'ok',
    'order', public.build_order_json(v_order.id)
  );
end;
$$;

create or replace function public.cancel_public_order_by_queue(
  p_queue_number text,
  p_customer_name text default null,
  p_contact_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_clean_queue text := upper(trim(coalesce(p_queue_number, '')));
  v_order_name text;
  v_input_name text;
  v_order_digits text;
  v_input_digits text;
  v_verified boolean := false;
begin
  if v_clean_queue = '' then
    return null;
  end if;

  select *
  into v_order
  from public.orders
  where upper(queue_number) = v_clean_queue
  order by created_at desc
  limit 1
  for update;

  if not found then
    return null;
  end if;

  v_order_name := lower(regexp_replace(trim(coalesce(v_order.customer_name, '')), '\s+', ' ', 'g'));
  v_input_name := lower(regexp_replace(trim(coalesce(p_customer_name, '')), '\s+', ' ', 'g'));

  v_order_digits := regexp_replace(coalesce(v_order.contact_number, ''), '[^0-9]', '', 'g');
  if length(v_order_digits) = 12 and left(v_order_digits, 2) = '63' then
    v_order_digits := '0' || substr(v_order_digits, 3);
  elsif length(v_order_digits) = 10 and left(v_order_digits, 1) = '9' then
    v_order_digits := '0' || v_order_digits;
  end if;

  v_input_digits := regexp_replace(coalesce(p_contact_number, ''), '[^0-9]', '', 'g');
  if length(v_input_digits) = 12 and left(v_input_digits, 2) = '63' then
    v_input_digits := '0' || substr(v_input_digits, 3);
  elsif length(v_input_digits) = 10 and left(v_input_digits, 1) = '9' then
    v_input_digits := '0' || v_input_digits;
  end if;

  if v_order.fulfillment = 'delivery' then
    if v_order_digits <> '' and v_input_digits <> '' and v_order_digits = v_input_digits then
      v_verified := true;
    end if;
  else
    if v_order_name <> '' and v_input_name <> '' and v_order_name = v_input_name then
      v_verified := true;
    elsif v_order_digits <> '' and v_input_digits <> '' and v_order_digits = v_input_digits then
      v_verified := true;
    end if;
  end if;

  if not v_verified then
    return jsonb_build_object('outcome', 'verification_failed');
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object(
      'outcome', 'ok',
      'tracker', public.build_public_order_tracker_json(v_order.id)
    );
  end if;

  if v_order.status <> 'received'
    or v_order.payment_status in ('pending_verification', 'paid')
  then
    return jsonb_build_object(
      'outcome', 'not_cancellable',
      'tracker', public.build_public_order_tracker_json(v_order.id)
    );
  end if;

  update public.orders
  set status = 'cancelled'
  where id = v_order.id;

  return jsonb_build_object(
    'outcome', 'ok',
    'tracker', public.build_public_order_tracker_json(v_order.id)
  );
end;
$$;

-- Single-query admin order stage & pending-verification counts RPC
create or replace function public.get_admin_order_stage_counts(
  p_since timestamptz default null,
  p_query text default null,
  p_payment_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_clean_query text := trim(coalesce(p_query, ''));
  v_like_pattern text := null;
  v_payment_filter text := null;
  v_received integer := 0;
  v_preparing integer := 0;
  v_ready integer := 0;
  v_completed integer := 0;
  v_cancelled integer := 0;
  v_pending_verification integer := 0;
begin
  if v_clean_query <> '' then
    v_like_pattern := '%' || replace(replace(replace(v_clean_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  if p_payment_status in ('unpaid', 'pending_verification', 'paid') then
    v_payment_filter := p_payment_status;
  end if;

  select
    count(*) filter (
      where o.status = 'received'
        and (v_payment_filter is null or o.payment_status = v_payment_filter)
    )::integer,
    count(*) filter (
      where o.status = 'preparing'
        and (v_payment_filter is null or o.payment_status = v_payment_filter)
    )::integer,
    count(*) filter (
      where o.status = 'ready'
        and (v_payment_filter is null or o.payment_status = v_payment_filter)
    )::integer,
    count(*) filter (
      where o.status = 'completed'
        and (v_payment_filter is null or o.payment_status = v_payment_filter)
    )::integer,
    count(*) filter (
      where o.status = 'cancelled'
        and (v_payment_filter is null or o.payment_status = v_payment_filter)
    )::integer,
    count(*) filter (
      where o.payment_status = 'pending_verification'
    )::integer
  into
    v_received,
    v_preparing,
    v_ready,
    v_completed,
    v_cancelled,
    v_pending_verification
  from public.orders o
  where (p_since is null or o.created_at >= p_since)
    and (
      v_like_pattern is null
      or o.queue_number ilike v_like_pattern escape '\'
      or o.customer_name ilike v_like_pattern escape '\'
      or o.contact_number ilike v_like_pattern escape '\'
      or o.address_or_notes ilike v_like_pattern escape '\'
      or o.table_number ilike v_like_pattern escape '\'
      or o.payment_reference ilike v_like_pattern escape '\'
    );

  return jsonb_build_object(
    'all', v_received + v_preparing + v_ready + v_completed + v_cancelled,
    'active', v_received + v_preparing + v_ready,
    'received', v_received,
    'preparing', v_preparing,
    'ready', v_ready,
    'completed', v_completed,
    'cancelled', v_cancelled,
    'pendingVerification', v_pending_verification
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
  text,
  double precision,
  double precision,
  text,
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
  text,
  double precision,
  double precision,
  text,
  text,
  text,
  jsonb,
  integer
) to service_role;

revoke all on function public.submit_payment_reference_by_receipt(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_payment_reference_by_receipt(uuid, text, text)
  to service_role;

revoke all on function public.cancel_order_by_receipt(uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_order_by_receipt(uuid, text)
  to service_role;

revoke all on function public.cancel_public_order_by_queue(text, text, text)
  from public, anon, authenticated;
grant execute on function public.cancel_public_order_by_queue(text, text, text)
  to service_role;

revoke all on function public.get_admin_order_stage_counts(timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.get_admin_order_stage_counts(timestamptz, text, text)
  to service_role;
