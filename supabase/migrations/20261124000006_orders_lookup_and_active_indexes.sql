-- Speeds up public queue tracker & cancellation RPCs (`where upper(queue_number) = v_clean order by created_at desc limit 1`)
create index if not exists idx_orders_upper_queue_number_created_desc
  on public.orders (upper(queue_number), created_at desc);

-- Speeds up Staff Portal default `status = 'active'` keyset-paginated queries
create index if not exists idx_orders_active_created_desc
  on public.orders (created_at desc, id desc)
  where status in ('received', 'preparing', 'ready');
