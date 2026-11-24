-- Require a non-empty payment reference number at checkout for non-cash payment methods
-- (GCash, Maya, Bank Transfer) inside `public.place_order`.

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

  -- Validate enabled payment method & required reference for non-cash payments
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
    if v_payment_reference = '' then
      raise exception 'PAYMENT_REFERENCE_REQUIRED' using errcode = 'P0001';
    end if;
    if length(v_payment_reference) > 80 then
      raise exception 'INVALID_PAYMENT_REFERENCE' using errcode = 'P0001';
    end if;
    v_payment_status := 'pending_verification';
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
