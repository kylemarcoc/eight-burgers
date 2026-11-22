-- Idempotent Chino Roces Avenue catalog & delivery pricing seed
-- Safe to run once against fresh staging/production databases (never overwrites live edits).

insert into public.menu_addons (id, name, price_php, sort_order)
values
  ('sliced-cheese', 'Sliced Cheese', 20, 1),
  ('bacon', 'Crispy Bacon', 20, 2),
  ('veggies', 'Extra Veggies', 26, 3),
  ('pineapple', 'Grilled Pineapple', 26, 4)
on conflict (id) do nothing;

insert into public.store_settings (id, free_delivery_min_subtotal_php, origin_lat, origin_lng)
values (1, 500, 14.5608, 121.0124)
on conflict (id) do nothing;

insert into public.delivery_zones (id, name, areas, max_distance_km, fee_php, eta_minutes, enabled)
values
  (
    'chino-roces-san-antonio',
    'Chino Roces & San Antonio',
    'Eton WestEnd, Yakal, Malugay, San Antonio Village',
    2.5,
    35,
    '15–25 min',
    true
  ),
  (
    'makati-cbd-poblacion',
    'Makati CBD, Poblacion & Rockwell',
    'Legazpi, Salcedo, Ayala Ave, Bel-Air, Rockwell, Circuit',
    5.0,
    49,
    '20–35 min',
    true
  ),
  (
    'bgc-pasay-mandaluyong',
    'BGC, Pasay & Mandaluyong',
    'Bonifacio High Street, Uptown, MOA, Newport, Greenfield, Shaw',
    10.0,
    75,
    '30–45 min',
    true
  ),
  (
    'manila-ortigas-pasig',
    'Manila, Ortigas & Pasig',
    'Malate, Ermita, Taft, Ortigas Center, Kapitolyo, San Juan',
    16.0,
    95,
    '40–55 min',
    true
  ),
  (
    'qc-south-metro',
    'Quezon City, Parañaque & Alabang',
    'Cubao, Timog, Diliman, BF Homes, Sucat, Filinvest Alabang',
    25.0,
    125,
    '50–70 min',
    true
  )
on conflict (id) do nothing;

insert into public.menu_items (
  id,
  name,
  category,
  price_php,
  patty_spec,
  description,
  image_url,
  available,
  featured,
  allow_addons,
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
    true,
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
    true,
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
    true,
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
    true,
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
    true,
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
    true,
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
    true,
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
    true,
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
    false,
    16
  )
on conflict (id) do nothing;
