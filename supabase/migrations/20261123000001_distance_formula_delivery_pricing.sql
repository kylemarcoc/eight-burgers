-- Eight Burgers — Distance-Formula Delivery Pricing (Base Fee + Per-km Rate)
-- Moves delivery pricing off bracket zones onto `public.store_settings`, updates
-- server-side `place_order` and order JSON builders, and removes `public.delivery_zones`.

alter table public.store_settings
  add column if not exists delivery_enabled boolean not null default true,
  add column if not exists delivery_base_fee_php integer not null default 35 check (
    delivery_base_fee_php >= 0 and delivery_base_fee_php <= 10000
  ),
  add column if not exists delivery_per_km_rate_php integer not null default 10 check (
    delivery_per_km_rate_php >= 0 and delivery_per_km_rate_php <= 1000
  ),
  add column if not exists delivery_max_distance_km numeric(6, 1) not null default 25.0 check (
    delivery_max_distance_km >= 0.1 and delivery_max_distance_km <= 200.0
  );

create or replace function public.estimate_delivery_fee_php(
  p_distance_km numeric(6, 1),
  p_base_fee_php integer,
  p_per_km_rate_php integer
)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_tenths integer := greatest(0, round(coalesce(p_distance_km, 0) * 10.0)::integer);
  v_base integer := greatest(0, coalesce(p_base_fee_php, 0));
  v_rate integer := greatest(0, coalesce(p_per_km_rate_php, 0));
  v_distance_fee integer := (v_tenths * v_rate + 5) / 10;
begin
  return v_base + v_distance_fee;
end;
$$;

create or replace function public.estimate_delivery_eta_minutes(
  p_distance_km numeric(6, 1)
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_tenths integer := greatest(0, round(coalesce(p_distance_km, 0) * 10.0)::integer);
  v_raw_min integer := 15 + ((v_tenths * 2 + 5) / 10);
  v_eta_min integer := ((v_raw_min + 2) / 5) * 5;
  v_spread integer := case when v_tenths > 100 then 15 else 10 end;
begin
  return v_eta_min::text || '–' || (v_eta_min + v_spread)::text || ' min';
end;
$$;

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
        'addonNames', to_jsonb(ol.addon_names),
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
        'addonNames', to_jsonb(ol.addon_names)
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

drop function if exists public.place_order(
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
  select *
  into v_settings
  from public.store_settings
  where id = 1;

  if p_fulfillment = 'delivery' then
    if not found or not v_settings.delivery_enabled then
      raise exception 'DELIVERY_UNAVAILABLE' using errcode = 'P0001';
    end if;

    if p_delivery_pin_lat is null or p_delivery_pin_lng is null then
      raise exception 'DELIVERY_PIN_REQUIRED' using errcode = 'P0001';
    end if;

    v_distance_km := public.estimate_road_distance_km(
      coalesce(v_settings.origin_lat, 14.5608),
      coalesce(v_settings.origin_lng, 121.0124),
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
  v_queue_number := '#8B-' || v_queue_seq::text;

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

alter table public.orders
  drop constraint if exists orders_delivery_zone_id_fkey;

drop table if exists public.delivery_zones;
