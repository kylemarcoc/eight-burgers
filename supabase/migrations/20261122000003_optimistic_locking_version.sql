-- Eight Burgers — Integer Optimistic Concurrency Versions
-- Adds monotonic integer `version` columns and updates row triggers so admin
-- mutations enforce atomic `WHERE id = $id AND version = $expected_version`.

alter table public.menu_items
  add column if not exists version integer not null default 1 check (version >= 1);

alter table public.store_settings
  add column if not exists version integer not null default 1 check (version >= 1);

alter table public.delivery_zones
  add column if not exists version integer not null default 1 check (version >= 1);

alter table public.orders
  add column if not exists version integer not null default 1 check (version >= 1);

create or replace function public.bump_row_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

drop trigger if exists trg_menu_items_updated_at on public.menu_items;
create trigger trg_menu_items_updated_at
  before update on public.menu_items
  for each row
  execute function public.bump_row_version();

drop trigger if exists trg_store_settings_updated_at on public.store_settings;
create trigger trg_store_settings_updated_at
  before update on public.store_settings
  for each row
  execute function public.bump_row_version();

drop trigger if exists trg_delivery_zones_updated_at on public.delivery_zones;
create trigger trg_delivery_zones_updated_at
  before update on public.delivery_zones
  for each row
  execute function public.bump_row_version();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row
  execute function public.bump_row_version();

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

  if v_order.delivery_zone_id is not null then
    v_result := v_result || jsonb_build_object('deliveryZoneId', v_order.delivery_zone_id);
  end if;
  if v_order.delivery_zone_name is not null then
    v_result := v_result || jsonb_build_object('deliveryZoneName', v_order.delivery_zone_name);
  end if;
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
