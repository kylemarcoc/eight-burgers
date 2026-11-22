-- Eight Burgers — Order Cancellation (Two-Tier) & Public Non-PII Queue Status Tracker

alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in ('received', 'grilling', 'ready', 'completed', 'cancelled'));

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

  if v_order.delivery_zone_name is not null then
    v_result := v_result || jsonb_build_object('deliveryZoneName', v_order.delivery_zone_name);
  end if;
  if v_order.delivery_eta_minutes is not null then
    v_result := v_result || jsonb_build_object('deliveryEtaMinutes', v_order.delivery_eta_minutes);
  end if;

  return v_result;
end;
$$;

create or replace function public.get_public_order_status_by_queue(
  p_queue_number text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_found_id uuid;
  v_clean text := upper(trim(coalesce(p_queue_number, '')));
begin
  if v_clean = '' then
    return null;
  end if;

  select id
  into v_found_id
  from public.orders
  where upper(queue_number) = v_clean
  order by created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  return public.build_public_order_tracker_json(v_found_id);
end;
$$;

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

  if v_order.status <> 'received' then
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

  if v_order.status <> 'received' then
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

-- Least-privilege execution grants: callable strictly by backend BFF (service_role)
revoke all on function public.build_public_order_tracker_json(uuid) from public, anon, authenticated;
grant execute on function public.build_public_order_tracker_json(uuid) to service_role;

revoke all on function public.get_public_order_status_by_queue(text) from public, anon, authenticated;
grant execute on function public.get_public_order_status_by_queue(text) to service_role;

revoke all on function public.cancel_order_by_receipt(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_order_by_receipt(uuid, text) to service_role;

revoke all on function public.cancel_public_order_by_queue(text, text, text) from public, anon, authenticated;
grant execute on function public.cancel_public_order_by_queue(text, text, text) to service_role;
