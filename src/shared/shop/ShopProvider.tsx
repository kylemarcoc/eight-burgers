import { useCallback, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { ShopContext, type ShopContextValue } from './shop-context';
import {
  calculateCartDetails,
  loadPersistedShopState,
  persistShopState,
  shopReducer,
} from './shop-storage';
import type { MenuAddonId, MenuItemInput, OrderCustomerInput, OrderStatus } from './types';

export function ShopProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(shopReducer, undefined, loadPersistedShopState);

  useEffect(() => {
    persistShopState(state);
  }, [state]);

  const cartSummary = useMemo(
    () => calculateCartDetails(state.cart, state.menu),
    [state.cart, state.menu],
  );

  const setCartOpen = useCallback((open: boolean) => {
    dispatch({ type: 'set_cart_open', open });
  }, []);

  const addToCart = useCallback(
    (itemId: string, options?: { quantity?: number; addonIds?: MenuAddonId[] }) => {
      dispatch({
        type: 'add_to_cart',
        itemId,
        quantity: options?.quantity,
        addonIds: options?.addonIds,
      });
    },
    [],
  );

  const setLineQuantity = useCallback((lineId: string, quantity: number) => {
    dispatch({ type: 'set_line_quantity', lineId, quantity });
  }, []);

  const removeCartLine = useCallback((lineId: string) => {
    dispatch({ type: 'remove_cart_line', lineId });
  }, []);

  const clearCart = useCallback(() => {
    dispatch({ type: 'clear_cart' });
  }, []);

  const createMenuItem = useCallback((input: MenuItemInput) => {
    dispatch({ type: 'create_menu_item', input });
  }, []);

  const updateMenuItem = useCallback((id: string, input: MenuItemInput) => {
    dispatch({ type: 'update_menu_item', id, input });
  }, []);

  const toggleItemAvailability = useCallback((id: string) => {
    dispatch({ type: 'toggle_item_availability', id });
  }, []);

  const deleteMenuItem = useCallback((id: string) => {
    dispatch({ type: 'delete_menu_item', id });
  }, []);

  const resetCatalog = useCallback(() => {
    dispatch({ type: 'reset_catalog' });
  }, []);

  const placeOrder = useCallback((customer: OrderCustomerInput) => {
    dispatch({ type: 'place_order', customer });
  }, []);

  const updateOrderStatus = useCallback((orderId: string, status: OrderStatus) => {
    dispatch({ type: 'update_order_status', orderId, status });
  }, []);

  const dismissLastOrder = useCallback(() => {
    dispatch({ type: 'dismiss_last_order' });
  }, []);

  const value = useMemo<ShopContextValue>(
    () => ({
      menu: state.menu,
      cartSummary,
      orders: state.orders,
      isCartOpen: state.isCartOpen,
      lastPlacedOrder: state.lastPlacedOrder,
      setCartOpen,
      addToCart,
      setLineQuantity,
      removeCartLine,
      clearCart,
      createMenuItem,
      updateMenuItem,
      toggleItemAvailability,
      deleteMenuItem,
      resetCatalog,
      placeOrder,
      updateOrderStatus,
      dismissLastOrder,
    }),
    [
      state.menu,
      cartSummary,
      state.orders,
      state.isCartOpen,
      state.lastPlacedOrder,
      setCartOpen,
      addToCart,
      setLineQuantity,
      removeCartLine,
      clearCart,
      createMenuItem,
      updateMenuItem,
      toggleItemAvailability,
      deleteMenuItem,
      resetCatalog,
      placeOrder,
      updateOrderStatus,
      dismissLastOrder,
    ],
  );

  return <ShopContext value={value}>{children}</ShopContext>;
}
