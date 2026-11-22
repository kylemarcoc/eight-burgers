import {
  DEFAULT_DELIVERY_PRICING,
  DEFAULT_DELIVERY_ZONES,
  DEFAULT_FREE_DELIVERY_MIN_SUBTOTAL_PHP,
  DEFAULT_MENU_ITEMS,
  MENU_ADDONS,
  STORE_ORIGIN_COORDS,
} from '@eight-burgers/contracts';
import type { GeoCoordinates, MenuCategory } from './types';

function menuImage(filename: string): string {
  return `${import.meta.env.BASE_URL}images/menu/${filename}`;
}

export {
  DEFAULT_DELIVERY_PRICING,
  DEFAULT_DELIVERY_ZONES,
  DEFAULT_FREE_DELIVERY_MIN_SUBTOTAL_PHP,
  DEFAULT_MENU_ITEMS,
  MENU_ADDONS,
  STORE_ORIGIN_COORDS,
};

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

export const METRO_MANILA_LANDMARK_PINS: readonly {
  label: string;
  coords: GeoCoordinates;
}[] = [
  { label: 'Chino Roces', coords: { lat: 14.5608, lng: 121.0124 } },
  { label: 'Makati CBD', coords: { lat: 14.5547, lng: 121.0244 } },
  { label: 'BGC', coords: { lat: 14.5515, lng: 121.0503 } },
  { label: 'Ortigas', coords: { lat: 14.5869, lng: 121.0614 } },
  { label: 'Alabang', coords: { lat: 14.417, lng: 121.041 } },
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
