import { createContext, useContext } from 'react';
import type { CartSummary } from './shop-storage';
import type {
  MenuAddonId,
  MenuItem,
  MenuItemInput,
  OrderCustomerInput,
  OrderRecord,
  OrderStatus,
} from './types';

export type ShopContextValue = {
  menu: readonly MenuItem[];
  cartSummary: CartSummary;
  orders: readonly OrderRecord[];
  isCartOpen: boolean;
  lastPlacedOrder: OrderRecord | null;
  setCartOpen: (open: boolean) => void;
  addToCart: (itemId: string, options?: { quantity?: number; addonIds?: MenuAddonId[] }) => void;
  setLineQuantity: (lineId: string, quantity: number) => void;
  removeCartLine: (lineId: string) => void;
  clearCart: () => void;
  createMenuItem: (input: MenuItemInput) => void;
  updateMenuItem: (id: string, input: MenuItemInput) => void;
  toggleItemAvailability: (id: string) => void;
  deleteMenuItem: (id: string) => void;
  resetCatalog: () => void;
  placeOrder: (customer: OrderCustomerInput) => void;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  dismissLastOrder: () => void;
};

export const ShopContext = createContext<ShopContextValue | undefined>(undefined);

export function useShop(): ShopContextValue {
  const context = useContext(ShopContext);
  if (!context) {
    throw new Error('useShop must be used within a ShopProvider');
  }
  return context;
}
