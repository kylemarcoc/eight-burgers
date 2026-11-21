import type { MenuAddon, MenuCategory, MenuItem } from './types';

function menuImage(filename: string): string {
  return `${import.meta.env.BASE_URL}images/menu/${filename}`;
}

export const STORE_METADATA = {
  name: '8Burgers',
  branch: 'Chino Roces Avenue, Makati',
  landmark: 'Beside Pickup Coffee, near Eton WestEnd Square',
  contact: '(0916) 520-5707',
  hours: 'Daily · 10:00 AM – 11:00 PM',
  foodpandaUrl: 'https://www.foodpanda.ph/restaurant/om5p/8burgers-chino-roces-avenue',
  facebookUrl: 'https://www.facebook.com/p/8Burgers-61556691506190/',
  bannerImageUrl: menuImage('hero-banner.webp'),
} as const;

export const MENU_CATEGORIES: readonly {
  id: MenuCategory;
  label: string;
  description: string;
}[] = [
  {
    id: 'classic-burgers',
    label: 'Classic Burgers',
    description: 'Pure beef griddle staples with crisp garden toppings.',
  },
  {
    id: 'specialty-burgers',
    label: 'Specialty Burgers',
    description: 'Signature sauces, salsa, wasabi mayo, taco beef, and grilled pineapple.',
  },
  {
    id: 'heavyweights',
    label: 'Heavyweights & Sandwiches',
    description: 'Double patties, cheesesteaks, and sausage rolls built for big appetites.',
  },
  {
    id: 'sides-snacks',
    label: 'Sides & Snacks',
    description: 'Crinkle fries, seasoned potato wedges, and loaded nacho trays.',
  },
];

export const MENU_ADDONS: readonly MenuAddon[] = [
  { id: 'sliced-cheese', name: 'Sliced Cheese', pricePhp: 20 },
  { id: 'bacon', name: 'Crispy Bacon', pricePhp: 20 },
  { id: 'veggies', name: 'Extra Veggies', pricePhp: 26 },
  { id: 'pineapple', name: 'Grilled Pineapple', pricePhp: 26 },
];

export const IMAGE_PRESETS: readonly { label: string; url: string }[] = [
  {
    label: 'Chino Roces Store Banner',
    url: menuImage('hero-banner.webp'),
  },
  {
    label: 'Burger Deluxe',
    url: menuImage('burger-deluxe.webp'),
  },
  {
    label: 'American Burger',
    url: menuImage('american-burger.webp'),
  },
  {
    label: 'Overload Burger',
    url: menuImage('overload-burger.webp'),
  },
  {
    label: 'Hawaiian Burger',
    url: menuImage('hawaiian-burger.webp'),
  },
  {
    label: 'Crinkle Cut Fries',
    url: menuImage('crinkle-cut-fries.webp'),
  },
  {
    label: 'Potato Wedges',
    url: menuImage('potato-wedges.webp'),
  },
  {
    label: 'Nachos Overload',
    url: menuImage('nachos-overload.webp'),
  },
];

export const DEFAULT_MENU_ITEMS: readonly MenuItem[] = [
  {
    id: 'mini-cheese-burger-deluxe',
    name: 'Mini Cheese Burger Deluxe',
    category: 'classic-burgers',
    pricePhp: 90,
    pattySpec: '65g Junior Beef',
    description:
      'Compact seared beef patty, melted cheese slice, crisp lettuce, tomato, cucumber, and house mayo dressing on a soft bun.',
    imageUrl: menuImage('mini-cheese-burger-deluxe.webp'),
    available: true,
    featured: false,
    allowAddons: true,
  },
  {
    id: 'burger-deluxe',
    name: 'Burger Deluxe',
    category: 'classic-burgers',
    pricePhp: 148,
    pattySpec: '100g Pure Beef',
    description:
      '100g pure beef patty topped with fresh onion, crisp lettuce, juicy tomato slices, cool cucumber, and creamy mayo on a soft bun.',
    imageUrl: menuImage('burger-deluxe.webp'),
    available: true,
    featured: true,
    allowAddons: true,
  },
  {
    id: 'cheese-burger-deluxe',
    name: 'Cheese Burger Deluxe',
    category: 'classic-burgers',
    pricePhp: 168,
    pattySpec: '100g Pure Beef',
    description:
      '100g pure beef patty layered with melted cheddar, warm mayo cheese sauce, lettuce, tomato, onion, and cucumber on a toasted bun.',
    imageUrl: menuImage('cheese-burger-deluxe.webp'),
    available: true,
    featured: true,
    allowAddons: true,
  },
  {
    id: 'chicano-burger',
    name: 'Chicano Burger',
    category: 'specialty-burgers',
    pricePhp: 158,
    pattySpec: '100g Pure Beef',
    description:
      '100g pure beef patty finished with creamy mayo, melted cheese sauce, crisp lettuce, and zesty tomato-chili house salsa.',
    imageUrl: menuImage('chicano-burger.webp'),
    available: true,
    featured: true,
    allowAddons: true,
  },
  {
    id: 'mexican-burger',
    name: 'Mexican Burger',
    category: 'specialty-burgers',
    pricePhp: 158,
    pattySpec: '100g Beef + Taco Meat',
    description:
      '100g pure beef patty stacked with seasoned taco beef, crisp lettuce, creamy mayo, and rich cheese sauce on a toasted bun.',
    imageUrl: menuImage('mexican-burger.webp'),
    available: true,
    featured: false,
    allowAddons: true,
  },
  {
    id: 'japanese-burger',
    name: 'Japanese Burger',
    category: 'specialty-burgers',
    pricePhp: 158,
    pattySpec: '100g Pure Beef',
    description:
      '100g pure beef patty paired with crisp shredded lettuce, punchy wasabi mayo, and rich warm cheese sauce.',
    imageUrl: menuImage('japanese-burger.webp'),
    available: true,
    featured: false,
    allowAddons: true,
  },
  {
    id: 'american-burger',
    name: 'American Burger',
    category: 'specialty-burgers',
    pricePhp: 178,
    pattySpec: '100g Beef + Bacon',
    description:
      '100g pure beef patty topped with creamy mayo, melted cheese sauce, savory sautéed mushrooms, and crispy bacon strips.',
    imageUrl: menuImage('american-burger.webp'),
    available: true,
    featured: true,
    allowAddons: true,
  },
  {
    id: 'hawaiian-burger',
    name: 'Hawaiian Burger',
    category: 'specialty-burgers',
    pricePhp: 188,
    pattySpec: '100g Beef + Pineapple',
    description:
      '100g pure beef patty with sweet caramelized pineapple, lettuce, tomato, onion, cucumber, creamy mayo, and cheese sauce.',
    imageUrl: menuImage('hawaiian-burger.webp'),
    available: true,
    featured: false,
    allowAddons: true,
  },
  {
    id: 'hungarian-sandwich',
    name: 'Hungarian Sandwich',
    category: 'heavyweights',
    pricePhp: 175,
    pattySpec: 'Grilled Sausage',
    description:
      'Smoky grilled Hungarian sausage tucked into a warm toasted roll with tangy dressing and rich melted cheese sauce.',
    imageUrl: menuImage('hungarian-sandwich.webp'),
    available: true,
    featured: false,
    allowAddons: true,
  },
  {
    id: 'philly-cheese-steak',
    name: 'Philly Ground Beef Cheese Steak',
    category: 'heavyweights',
    pricePhp: 178,
    pattySpec: 'Seared Ground Beef',
    description:
      'Savory seared ground beef tossed with sweet sautéed onions and peppers, smothered in warm cheese sauce on a soft long roll.',
    imageUrl: menuImage('philly-cheese-steak.webp'),
    available: true,
    featured: false,
    allowAddons: true,
  },
  {
    id: 'ultimate-burger',
    name: 'Ultimate Burger',
    category: 'heavyweights',
    pricePhp: 218,
    pattySpec: '100g Beef Loaded',
    description:
      '100g pure beef patty piled high with crispy bacon, sautéed mushrooms, fried egg, crisp garden veggies, and signature sauces.',
    imageUrl: menuImage('ultimate-burger.webp'),
    available: true,
    featured: false,
    allowAddons: true,
  },
  {
    id: 'ultimate-cheese-burger',
    name: 'Ultimate Cheese Burger',
    category: 'heavyweights',
    pricePhp: 238,
    pattySpec: 'Double Cheese Stack',
    description:
      '100g pure beef patty with extra sliced cheddar, molten cheese sauce, crispy bacon, fried egg, and fresh garden crunch.',
    imageUrl: menuImage('ultimate-cheese-burger.webp'),
    available: true,
    featured: false,
    allowAddons: true,
  },
  {
    id: 'overload-burger',
    name: 'Overload Burger',
    category: 'heavyweights',
    pricePhp: 298,
    pattySpec: 'Double 100g Beef',
    description:
      'Double 100g pure beef patties layered with crispy bacon, spiced taco beef, sautéed mushrooms, double cheese, and full toppings.',
    imageUrl: menuImage('overload-burger.webp'),
    available: true,
    featured: true,
    allowAddons: true,
  },
  {
    id: 'crinkle-cut-fries',
    name: 'Crinkle Cut Fries',
    category: 'sides-snacks',
    pricePhp: 78,
    pattySpec: 'Crispy Cut',
    description: 'Golden fried crinkle-cut potato ridges seasoned warm out of the fryer.',
    imageUrl: menuImage('crinkle-cut-fries.webp'),
    available: true,
    featured: false,
    allowAddons: false,
  },
  {
    id: 'potato-wedges',
    name: 'Potato Wedges',
    category: 'sides-snacks',
    pricePhp: 78,
    pattySpec: 'Seasoned Wedges',
    description: 'Thick-cut skin-on potato wedges with crisp seasoned edges and fluffy centers.',
    imageUrl: menuImage('potato-wedges.webp'),
    available: true,
    featured: false,
    allowAddons: false,
  },
  {
    id: 'nachos-overload',
    name: 'Nachos Overload',
    category: 'sides-snacks',
    pricePhp: 218,
    pattySpec: 'Shareable Tray',
    description:
      'Crispy tortilla chips loaded with seasoned ground beef, diced tomatoes, fresh onions, and generous warm melted cheese sauce.',
    imageUrl: menuImage('nachos-overload.webp'),
    available: true,
    featured: true,
    allowAddons: false,
  },
];
