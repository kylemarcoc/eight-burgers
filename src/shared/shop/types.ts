export type MenuCategory =
  'classic-burgers' | 'specialty-burgers' | 'heavyweights' | 'sides-snacks';

export type MenuAddonId = 'sliced-cheese' | 'bacon' | 'veggies' | 'pineapple';

export type MenuAddon = {
  id: MenuAddonId;
  name: string;
  pricePhp: number;
};

export type MenuItem = {
  id: string;
  name: string;
  category: MenuCategory;
  pricePhp: number;
  pattySpec: string;
  description: string;
  imageUrl: string;
  available: boolean;
  featured: boolean;
  allowAddons: boolean;
};

export type MenuItemInput = Omit<MenuItem, 'id'>;

export type CartLineItem = {
  lineId: string;
  itemId: string;
  quantity: number;
  addonIds: MenuAddonId[];
};

export type FulfillmentMode = 'kiosk-pickup' | 'makati-delivery';

export type PaymentMethod = 'cash' | 'gcash' | 'maya';

export type OrderStatus = 'received' | 'grilling' | 'ready' | 'completed';

export type OrderLineSnapshot = {
  lineId: string;
  itemId: string;
  name: string;
  unitPricePhp: number;
  addonNames: string[];
  addonsPricePhp: number;
  quantity: number;
  lineTotalPhp: number;
};

export type OrderCustomerInput = {
  customerName: string;
  contactNumber: string;
  fulfillment: FulfillmentMode;
  addressOrNotes: string;
  paymentMethod: PaymentMethod;
};

export type OrderRecord = OrderCustomerInput & {
  id: string;
  queueNumber: string;
  lines: OrderLineSnapshot[];
  subtotalPhp: number;
  deliveryFeePhp: number;
  totalPhp: number;
  status: OrderStatus;
  createdAtIso: string;
};
