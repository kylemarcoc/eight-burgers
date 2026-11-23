-- Idempotent 8Burgers Chino Roces Avenue demo catalog, option groups & store profile seed
-- Safe to run once against fresh staging/production databases (never overwrites live edits).

insert into public.menu_categories (id, name, description, sort_order, active)
values
  ('classic-burgers', 'Classic Burgers', 'Pure beef griddle staples with crisp garden toppings.', 1, true),
  ('specialty-burgers', 'Specialty Burgers', 'Signature sauces, salsa, wasabi mayo, taco beef, and grilled pineapple.', 2, true),
  ('heavyweights', 'Heavyweights & Sandwiches', 'Double patties, cheesesteaks, and sausage rolls built for big appetites.', 3, true),
  ('sides-snacks', 'Sides & Snacks', 'Crinkle fries, seasoned potato wedges, and loaded nacho trays.', 4, true)
on conflict (id) do nothing;

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
values (
  'add-ons',
  'Add-ons',
  'Optional extras for your burger or sandwich.',
  'multi',
  false,
  0,
  null,
  1,
  true
)
on conflict (id) do nothing;

insert into public.option_choices (
  id,
  group_id,
  name,
  price_delta_php,
  available,
  is_default,
  sort_order
)
values
  ('sliced-cheese', 'add-ons', 'Sliced Cheese', 20, true, false, 1),
  ('bacon', 'add-ons', 'Crispy Bacon', 20, true, false, 2),
  ('veggies', 'add-ons', 'Extra Veggies', 26, true, false, 3),
  ('pineapple', 'add-ons', 'Grilled Pineapple', 26, true, false, 4)
on conflict (id) do nothing;

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
  '8Burgers',
  'Chino Roces Avenue, Makati',
  '8B',
  '100g pure beef griddle burgers, made fresh on Chino Roces.',
  'Walk up beside Pickup Coffee near Eton WestEnd Square or place an order for delivery. Pick your burgers below, customize with cheese, bacon, or pineapple, and review your bag from the floating cart button at the bottom right.',
  '100g Pure Beef',
  'Chino Roces Avenue, San Antonio, Makati',
  'Beside Pickup Coffee, near Eton WestEnd Square',
  '(0916) 520-5707',
  'Daily · 10:00 AM – 11:00 PM',
  'Eton WestEnd',
  '',
  '/images/menu/hero-banner.webp',
  '[
    {"label": "Foodpanda", "url": "https://www.foodpanda.ph/restaurant/om5p/8burgers-chino-roces-avenue"},
    {"label": "Facebook", "url": "https://www.facebook.com/p/8Burgers-61556691506190/"}
  ]'::jsonb,
  '8B',
  'On the Grill',
  'ember',
  null,
  true,
  '',
  true,
  true,
  false,
  true,
  '{
    "cash": {
      "enabled": true,
      "label": "Cash",
      "accountName": "",
      "accountNumber": "",
      "instructions": "Pay at the counter on pickup or to the rider upon delivery.",
      "qrImageUrl": ""
    },
    "gcash": {
      "enabled": true,
      "label": "GCash",
      "accountName": "8Burgers Chino Roces",
      "accountNumber": "0916 520 5707",
      "instructions": "Send your total via GCash and enter the reference number below.",
      "qrImageUrl": ""
    },
    "maya": {
      "enabled": true,
      "label": "Maya",
      "accountName": "8Burgers Chino Roces",
      "accountNumber": "0916 520 5707",
      "instructions": "Send your total via Maya and enter the reference number below.",
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
  500,
  14.5608,
  121.0124
)
on conflict (id) do nothing;

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
values
  (
    'mini-cheese-burger-deluxe',
    'Mini Cheese Burger Deluxe',
    'classic-burgers',
    90,
    '65g Junior Beef',
    'Compact seared beef patty, melted cheese slice, crisp lettuce, tomato, cucumber, and house mayo dressing on a soft bun.',
    '/images/menu/mini-cheese-burger-deluxe.webp',
    true,
    false,
    1
  ),
  (
    'burger-deluxe',
    'Burger Deluxe',
    'classic-burgers',
    148,
    '100g Pure Beef',
    '100g pure beef patty topped with fresh onion, crisp lettuce, juicy tomato slices, cool cucumber, and creamy mayo on a soft bun.',
    '/images/menu/burger-deluxe.webp',
    true,
    true,
    2
  ),
  (
    'cheese-burger-deluxe',
    'Cheese Burger Deluxe',
    'classic-burgers',
    168,
    '100g Pure Beef',
    '100g pure beef patty layered with melted cheddar, warm mayo cheese sauce, lettuce, tomato, onion, and cucumber on a toasted bun.',
    '/images/menu/cheese-burger-deluxe.webp',
    true,
    true,
    3
  ),
  (
    'chicano-burger',
    'Chicano Burger',
    'specialty-burgers',
    158,
    '100g Pure Beef',
    '100g pure beef patty finished with creamy mayo, melted cheese sauce, crisp lettuce, and zesty tomato-chili house salsa.',
    '/images/menu/chicano-burger.webp',
    true,
    true,
    4
  ),
  (
    'mexican-burger',
    'Mexican Burger',
    'specialty-burgers',
    158,
    '100g Beef + Taco Meat',
    '100g pure beef patty stacked with seasoned taco beef, crisp lettuce, creamy mayo, and rich cheese sauce on a toasted bun.',
    '/images/menu/mexican-burger.webp',
    true,
    false,
    5
  ),
  (
    'japanese-burger',
    'Japanese Burger',
    'specialty-burgers',
    158,
    '100g Pure Beef',
    '100g pure beef patty paired with crisp shredded lettuce, punchy wasabi mayo, and rich warm cheese sauce.',
    '/images/menu/japanese-burger.webp',
    true,
    false,
    6
  ),
  (
    'american-burger',
    'American Burger',
    'specialty-burgers',
    178,
    '100g Beef + Bacon',
    '100g pure beef patty topped with creamy mayo, melted cheese sauce, savory sautéed mushrooms, and crispy bacon strips.',
    '/images/menu/american-burger.webp',
    true,
    true,
    7
  ),
  (
    'hawaiian-burger',
    'Hawaiian Burger',
    'specialty-burgers',
    188,
    '100g Beef + Pineapple',
    '100g pure beef patty with sweet caramelized pineapple, lettuce, tomato, onion, cucumber, creamy mayo, and cheese sauce.',
    '/images/menu/hawaiian-burger.webp',
    true,
    false,
    8
  ),
  (
    'hungarian-sandwich',
    'Hungarian Sandwich',
    'heavyweights',
    175,
    'Grilled Sausage',
    'Smoky grilled Hungarian sausage tucked into a warm toasted roll with tangy dressing and rich melted cheese sauce.',
    '/images/menu/hungarian-sandwich.webp',
    true,
    false,
    9
  ),
  (
    'philly-cheese-steak',
    'Philly Ground Beef Cheese Steak',
    'heavyweights',
    178,
    'Seared Ground Beef',
    'Savory seared ground beef tossed with sweet sautéed onions and peppers, smothered in warm cheese sauce on a soft long roll.',
    '/images/menu/philly-cheese-steak.webp',
    true,
    false,
    10
  ),
  (
    'ultimate-burger',
    'Ultimate Burger',
    'heavyweights',
    218,
    '100g Beef Loaded',
    '100g pure beef patty piled high with crispy bacon, sautéed mushrooms, fried egg, crisp garden veggies, and signature sauces.',
    '/images/menu/ultimate-burger.webp',
    true,
    false,
    11
  ),
  (
    'ultimate-cheese-burger',
    'Ultimate Cheese Burger',
    'heavyweights',
    238,
    'Double Cheese Stack',
    '100g pure beef patty with extra sliced cheddar, molten cheese sauce, crispy bacon, fried egg, and fresh garden crunch.',
    '/images/menu/ultimate-cheese-burger.webp',
    true,
    false,
    12
  ),
  (
    'overload-burger',
    'Overload Burger',
    'heavyweights',
    298,
    'Double 100g Beef',
    'Double 100g pure beef patties layered with crispy bacon, spiced taco beef, sautéed mushrooms, double cheese, and full toppings.',
    '/images/menu/overload-burger.webp',
    true,
    true,
    13
  ),
  (
    'crinkle-cut-fries',
    'Crinkle Cut Fries',
    'sides-snacks',
    78,
    'Crispy Cut',
    'Golden fried crinkle-cut potato ridges seasoned warm out of the fryer.',
    '/images/menu/crinkle-cut-fries.webp',
    true,
    false,
    14
  ),
  (
    'potato-wedges',
    'Potato Wedges',
    'sides-snacks',
    78,
    'Seasoned Wedges',
    'Thick-cut skin-on potato wedges with crisp seasoned edges and fluffy centers.',
    '/images/menu/potato-wedges.webp',
    true,
    false,
    15
  ),
  (
    'nachos-overload',
    'Nachos Overload',
    'sides-snacks',
    218,
    'Shareable Tray',
    'Crispy tortilla chips loaded with seasoned ground beef, diced tomatoes, fresh onions, and generous warm melted cheese sauce.',
    '/images/menu/nachos-overload.webp',
    true,
    true,
    16
  )
on conflict (id) do nothing;

insert into public.menu_item_option_groups (item_id, group_id, sort_order)
values
  ('mini-cheese-burger-deluxe', 'add-ons', 1),
  ('burger-deluxe', 'add-ons', 1),
  ('cheese-burger-deluxe', 'add-ons', 1),
  ('chicano-burger', 'add-ons', 1),
  ('mexican-burger', 'add-ons', 1),
  ('japanese-burger', 'add-ons', 1),
  ('american-burger', 'add-ons', 1),
  ('hawaiian-burger', 'add-ons', 1),
  ('hungarian-sandwich', 'add-ons', 1),
  ('philly-cheese-steak', 'add-ons', 1),
  ('ultimate-burger', 'add-ons', 1),
  ('ultimate-cheese-burger', 'add-ons', 1),
  ('overload-burger', 'add-ons', 1)
on conflict (item_id, group_id) do nothing;
