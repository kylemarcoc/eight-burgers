-- Hardens cross-device public queue cancellation to require matching mobile number
-- across all fulfillment modes, exposes non-PII `hasContactNumber` on tracker responses,
-- and adds a DB-level BEFORE UPDATE/DELETE guard protecting the last active Owner.

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
    'hasContactNumber', (trim(coalesce(v_order.contact_number, '')) <> ''),
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

revoke all on function public.build_public_order_tracker_json(uuid) from public, anon, authenticated;
grant execute on function public.build_public_order_tracker_json(uuid) to service_role;

drop function if exists public.cancel_public_order_by_queue(text, text, text);

create or replace function public.cancel_public_order_by_queue(
  p_queue_number text,
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

  if v_order_digits <> '' and v_input_digits <> '' and v_order_digits = v_input_digits then
    v_verified := true;
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

revoke all on function public.cancel_public_order_by_queue(text, text) from public, anon, authenticated;
grant execute on function public.cancel_public_order_by_queue(text, text) to service_role;

create or replace function public.enforce_admin_users_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining_owners integer;
begin
  if auth.uid() is not null
    and old.role = 'owner'
    and old.active = true
    and (tg_op = 'DELETE' or new.role is distinct from 'owner' or new.active is distinct from true)
  then
    perform 1
    from public.admin_users
    where role = 'owner'
      and active = true
    order by user_id
    for update;

    select count(*)::integer
    into v_remaining_owners
    from public.admin_users
    where role = 'owner'
      and active = true
      and user_id <> old.user_id;

    if coalesce(v_remaining_owners, 0) < 1 then
      raise exception 'LAST_ACTIVE_OWNER: At least one active Owner account must remain enabled.'
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_admin_users_01_last_owner_guard on public.admin_users;
create trigger trg_admin_users_01_last_owner_guard
  before update or delete on public.admin_users
  for each row
  execute function public.enforce_admin_users_last_owner();
