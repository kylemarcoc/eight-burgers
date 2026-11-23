-- Idempotent brand-neutral blank shop seed for new production deployments.
-- Starts Pickup-only with Cash enabled and zero categories, option groups, or menu items
-- so the shop Owner can configure branding, pin, fulfillment, payments, and menu in /admin.

insert into public.store_settings (
  id,
  store_name,
  branch_label,
  monogram,
  hero_headline,
  hero_subtext,
  hero_badge_label,
  address,
  landmark,
  contact_phone,
  hours_text,
  pickup_spot_label,
  logo_url,
  hero_image_url,
  external_links,
  queue_prefix,
  preparing_stage_label,
  theme_accent_preset,
  theme_accent_hex,
  accepting_orders,
  closed_notice,
  pickup_enabled,
  delivery_enabled,
  dine_in_enabled,
  dine_in_table_required,
  payment_methods,
  delivery_base_fee_php,
  delivery_per_km_rate_php,
  delivery_max_distance_km,
  free_delivery_min_subtotal_php,
  origin_lat,
  origin_lng
)
values (
  1,
  'Your Shop',
  '',
  'SH',
  'Freshly made to order.',
  '',
  '',
  '',
  '',
  '',
  '',
  'Counter Pickup',
  '',
  '',
  '[]'::jsonb,
  'ORD',
  'Preparing',
  'ember',
  null,
  true,
  '',
  true,
  false,
  false,
  true,
  '{
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
  }'::jsonb,
  35,
  10,
  25.0,
  null,
  null,
  null
)
on conflict (id) do nothing;
