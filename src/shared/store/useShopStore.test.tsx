import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DELIVERY_FEE_PHP,
  MAX_PERSISTED_ORDERS,
  SHOP_STORAGE_KEY,
  buildCartLineId,
  createInitialShopState,
  formatPhp,
} from '@/shared/shop/shop-storage';
import {
  resetShopStore,
  useShopActions,
  useShopCartOpen,
  useShopCartSummary,
  useShopMenu,
  useShopOrders,
  useShopStore,
} from './useShopStore';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetShopStore();
  vi.restoreAllMocks();
});

describe('useShopStore performance and persistence', () => {
  it('does not write to localStorage on reset or UI-only drawer toggles', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    resetShopStore();

    function DrawerHarness() {
      const isCartOpen = useShopCartOpen();
      const { setCartOpen, addToCart, dismissLastOrder } = useShopActions();
      return (
        <div>
          <span data-testid="drawer-open">{String(isCartOpen)}</span>
          <button type="button" onClick={() => setCartOpen(true)}>
            Open Cart
          </button>
          <button type="button" onClick={() => setCartOpen(false)}>
            Close Cart
          </button>
          <button type="button" onClick={() => dismissLastOrder()}>
            Dismiss Receipt
          </button>
          <button type="button" onClick={() => addToCart('burger-deluxe')}>
            Add Burger
          </button>
        </div>
      );
    }

    render(<DrawerHarness />);

    expect(setItemSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open Cart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Cart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Receipt' }));
    expect(setItemSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Add Burger' }));
    expect(setItemSpy).toHaveBeenCalledTimes(1);

    const persistedRaw = setItemSpy.mock.calls[0]?.[1];
    expect(persistedRaw).toBeTruthy();
    const persistedJson = JSON.parse(persistedRaw ?? '{}') as {
      state?: Record<string, unknown>;
      version?: number;
    };
    expect(persistedJson.version).toBe(1);
    expect(persistedJson.state).toBeTruthy();
    expect(persistedJson.state).not.toHaveProperty('isCartOpen');
    expect(persistedJson.state).not.toHaveProperty('lastPlacedOrder');
    expect(persistedJson.state).not.toHaveProperty('cartSummary');
    expect(persistedJson.state).not.toHaveProperty('actions');
  });

  it('isolates menu, orders, and cart summary selectors from unrelated state updates', () => {
    let menuRenders = 0;
    let ordersRenders = 0;
    let summaryRenders = 0;

    function MenuObserver() {
      const menu = useShopMenu();
      menuRenders += 1;
      return <span data-testid="menu-count">{menu.length}</span>;
    }

    function OrdersObserver() {
      const orders = useShopOrders();
      ordersRenders += 1;
      return <span data-testid="orders-count">{orders.length}</span>;
    }

    function SummaryObserver() {
      const summary = useShopCartSummary();
      summaryRenders += 1;
      return <span data-testid="summary-items">{summary.totalItems}</span>;
    }

    function Controls() {
      const isCartOpen = useShopCartOpen();
      const { addToCart, setCartOpen } = useShopActions();
      return (
        <div>
          <span data-testid="drawer-state">{String(isCartOpen)}</span>
          <button type="button" onClick={() => setCartOpen(true)}>
            Toggle Drawer
          </button>
          <button type="button" onClick={() => addToCart('burger-deluxe')}>
            Add Item
          </button>
        </div>
      );
    }

    render(
      <>
        <MenuObserver />
        <OrdersObserver />
        <SummaryObserver />
        <Controls />
      </>,
    );

    expect(menuRenders).toBe(1);
    expect(ordersRenders).toBe(1);
    expect(summaryRenders).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Drawer' }));
    expect(screen.getByTestId('drawer-state').textContent).toBe('true');
    expect(menuRenders).toBe(1);
    expect(ordersRenders).toBe(1);
    expect(summaryRenders).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }));
    expect(screen.getByTestId('summary-items').textContent).toBe('1');
    expect(menuRenders).toBe(1);
    expect(ordersRenders).toBe(1);
    expect(summaryRenders).toBe(2);
  });

  it('preserves structural references across Immer order updates and restores defaults on reset', () => {
    const initialMenuRef = useShopStore.getState().menu;
    const { addToCart, placeOrder, updateOrderStatus } = useShopStore.getState().actions;

    addToCart('burger-deluxe');
    const summaryBeforeOrder = useShopStore.getState().cartSummary;
    expect(summaryBeforeOrder.totalItems).toBe(1);

    placeOrder({
      customerName: 'Marco',
      contactNumber: '09171234567',
      fulfillment: 'kiosk-pickup',
      addressOrNotes: '',
      paymentMethod: 'cash',
    });

    const summaryAfterOrder = useShopStore.getState().cartSummary;
    const orderId = useShopStore.getState().orders[0]?.id ?? '';
    expect(orderId).toBeTruthy();

    updateOrderStatus(orderId, 'ready');
    const stateAfterStatus = useShopStore.getState();
    expect(stateAfterStatus.orders[0]?.status).toBe('ready');
    expect(stateAfterStatus.lastPlacedOrder?.status).toBe('ready');
    expect(stateAfterStatus.menu).toBe(initialMenuRef);
    expect(stateAfterStatus.cartSummary).toBe(summaryAfterOrder);
  });
});

describe('useShopStore cart, order, and catalog actions', () => {
  it('merges identical cart lines and calculates add-on surcharges accurately', () => {
    const { addToCart } = useShopStore.getState().actions;

    addToCart('burger-deluxe', { addonIds: ['bacon', 'sliced-cheese'] });
    addToCart('burger-deluxe', { addonIds: ['sliced-cheese', 'bacon'] });

    const { cart, cartSummary } = useShopStore.getState();
    expect(cart).toHaveLength(1);
    expect(cart[0]?.lineId).toBe(buildCartLineId('burger-deluxe', ['bacon', 'sliced-cheese']));
    expect(cart[0]?.quantity).toBe(2);

    // Burger Deluxe (148) + Sliced Cheese (20) + Crispy Bacon (20) = 188 x 2 = 376
    expect(cartSummary.totalItems).toBe(2);
    expect(cartSummary.subtotalPhp).toBe(376);
    expect(formatPhp(cartSummary.subtotalPhp)).toBe('₱376');
  });

  it('supports incrementing, decrementing, and removing lines', () => {
    const { addToCart, setLineQuantity, removeCartLine } = useShopStore.getState().actions;

    addToCart('crinkle-cut-fries');
    addToCart('chicano-burger');

    setLineQuantity('crinkle-cut-fries', 3);
    expect(useShopStore.getState().cartSummary.totalItems).toBe(4);

    setLineQuantity('chicano-burger', 0);
    expect(useShopStore.getState().cart).toHaveLength(1);

    removeCartLine('crinkle-cut-fries');
    expect(useShopStore.getState().cart).toHaveLength(0);
  });

  it('creates an order ticket on checkout and updates status', () => {
    const { addToCart, placeOrder, updateOrderStatus } = useShopStore.getState().actions;

    addToCart('overload-burger');
    placeOrder({
      customerName: 'Marco',
      contactNumber: '09171234567',
      fulfillment: 'delivery',
      addressOrNotes: 'Eton WestEnd Tower 1',
      paymentMethod: 'gcash',
    });

    const afterPlace = useShopStore.getState();
    expect(afterPlace.cart).toHaveLength(0);
    expect(afterPlace.orders).toHaveLength(1);
    expect(afterPlace.lastPlacedOrder?.queueNumber).toBe('#8B-101');
    expect(afterPlace.lastPlacedOrder?.subtotalPhp).toBe(298);
    expect(afterPlace.lastPlacedOrder?.deliveryFeePhp).toBe(DEFAULT_DELIVERY_FEE_PHP);
    expect(afterPlace.lastPlacedOrder?.totalPhp).toBe(298 + DEFAULT_DELIVERY_FEE_PHP);

    const orderId = afterPlace.orders[0]?.id ?? '';
    updateOrderStatus(orderId, 'grilling');
    expect(useShopStore.getState().orders[0]?.status).toBe('grilling');
  });

  it('computes zone delivery fees, waives fees above free-delivery threshold, and persists admin delivery edits', () => {
    const {
      addToCart,
      placeOrder,
      createDeliveryZone,
      updateDeliveryZone,
      toggleDeliveryZone,
      deleteDeliveryZone,
      setFreeDeliveryThreshold,
      resetDeliveryPricing,
    } = useShopStore.getState().actions;

    // Pinning Alabang overrides any cheaper zoneId and locks fee to ₱125
    addToCart('overload-burger'); // ₱298 (< ₱500 threshold)
    placeOrder({
      customerName: 'Dana',
      contactNumber: '09175551234',
      fulfillment: 'delivery',
      deliveryZoneId: 'chino-roces-san-antonio',
      deliveryPin: { lat: 14.417, lng: 121.041 },
      addressOrNotes: 'Filinvest City, Alabang',
      paymentMethod: 'maya',
    });

    const firstOrder = useShopStore.getState().orders[0];
    expect(firstOrder?.deliveryZoneName).toBe('Quezon City, Parañaque & Alabang');
    expect(firstOrder?.deliveryFeePhp).toBe(125);
    expect(firstOrder?.deliveryDistanceKm).toBeGreaterThan(16);
    expect(firstOrder?.deliveryPin).toEqual({ lat: 14.417, lng: 121.041 });
    expect(firstOrder?.deliveryFeeWaived).toBeUndefined();
    expect(firstOrder?.totalPhp).toBe(423);

    // Out-of-range pin (> 25 km) is rejected and preserves the cart
    addToCart('overload-burger');
    placeOrder({
      customerName: 'Dana',
      contactNumber: '09175551234',
      fulfillment: 'delivery',
      deliveryPin: { lat: 14.1153, lng: 120.9621 },
      addressOrNotes: 'Tagaytay',
      paymentMethod: 'cash',
    });
    expect(useShopStore.getState().orders).toHaveLength(1);
    expect(useShopStore.getState().cart).toHaveLength(1);

    // Reaching >= ₱500 waives the zone delivery fee for an in-range pin
    addToCart('overload-burger'); // 2x Overload = ₱596
    placeOrder({
      customerName: 'Dana',
      contactNumber: '09175551234',
      fulfillment: 'delivery',
      deliveryPin: { lat: 14.417, lng: 121.041 },
      addressOrNotes: 'Filinvest City, Alabang',
      paymentMethod: 'gcash',
    });

    const freeOrder = useShopStore.getState().orders[0];
    expect(freeOrder?.deliveryZoneName).toBe('Quezon City, Parañaque & Alabang');
    expect(freeOrder?.deliveryFeePhp).toBe(0);
    expect(freeOrder?.deliveryFeeWaived).toBe(true);
    expect(freeOrder?.totalPhp).toBe(596);

    // Admin zone CRUD + threshold update
    setFreeDeliveryThreshold(650);
    expect(useShopStore.getState().deliveryPricing.freeDeliveryMinSubtotalPhp).toBe(650);

    createDeliveryZone({
      name: 'Marikina & Cainta',
      areas: 'Riverbanks, Katipunan, Marcos Hwy',
      maxDistanceKm: 28,
      feePhp: 135,
      etaMinutes: '55–75 min',
      enabled: true,
    });
    const addedZone = useShopStore
      .getState()
      .deliveryPricing.zones.find((z) => z.id === 'marikina-cainta');
    expect(addedZone?.feePhp).toBe(135);
    expect(addedZone?.maxDistanceKm).toBe(28);

    updateDeliveryZone('marikina-cainta', {
      name: 'Marikina & Cainta',
      areas: 'Riverbanks, Katipunan, Marcos Hwy, Sta. Lucia',
      maxDistanceKm: 30,
      feePhp: 140,
      etaMinutes: '55–75 min',
      enabled: true,
    });
    expect(
      useShopStore.getState().deliveryPricing.zones.find((z) => z.id === 'marikina-cainta')?.feePhp,
    ).toBe(140);

    toggleDeliveryZone('marikina-cainta');
    expect(
      useShopStore.getState().deliveryPricing.zones.find((z) => z.id === 'marikina-cainta')
        ?.enabled,
    ).toBe(false);

    deleteDeliveryZone('marikina-cainta');
    expect(
      useShopStore.getState().deliveryPricing.zones.find((z) => z.id === 'marikina-cainta'),
    ).toBeUndefined();

    resetDeliveryPricing();
    expect(useShopStore.getState().deliveryPricing.freeDeliveryMinSubtotalPhp).toBe(500);
    expect(useShopStore.getState().deliveryPricing.zones).toHaveLength(5);
  });

  it('creates, updates, toggles availability, and deletes menu listings for admin', () => {
    const { createMenuItem, addToCart, toggleItemAvailability, updateMenuItem, deleteMenuItem } =
      useShopStore.getState().actions;
    const initialCount = useShopStore.getState().menu.length;

    createMenuItem({
      name: 'Chino Roces Truffle Melt',
      category: 'specialty-burgers',
      pricePhp: 198,
      pattySpec: '100g Pure Beef',
      description: 'Truffle aioli and double Swiss cheese.',
      imageUrl: '',
      available: true,
      featured: true,
      allowAddons: true,
    });

    expect(useShopStore.getState().menu).toHaveLength(initialCount + 1);
    const created = useShopStore.getState().menu[0];
    expect(created?.id).toBe('chino-roces-truffle-melt');

    addToCart(created?.id ?? '');
    expect(useShopStore.getState().cart).toHaveLength(1);

    // Toggling sold out clears the unavailable item from active cart
    toggleItemAvailability(created?.id ?? '');
    expect(useShopStore.getState().menu[0]?.available).toBe(false);
    expect(useShopStore.getState().cart).toHaveLength(0);

    updateMenuItem(created?.id ?? '', {
      name: 'Chino Roces Truffle Melt',
      category: 'heavyweights',
      pricePhp: 215,
      pattySpec: 'Double 100g Beef',
      description: 'Upgraded double patty.',
      imageUrl: '',
      available: true,
      featured: true,
      allowAddons: true,
    });
    expect(useShopStore.getState().menu[0]?.pricePhp).toBe(215);
    expect(useShopStore.getState().menu[0]?.category).toBe('heavyweights');

    deleteMenuItem(created?.id ?? '');
    expect(useShopStore.getState().menu).toHaveLength(initialCount);
  });

  it('clears the cart, dismisses the receipt without deleting order history, and prunes custom items on catalog reset', () => {
    const { addToCart, clearCart, placeOrder, dismissLastOrder, createMenuItem, resetCatalog } =
      useShopStore.getState().actions;

    addToCart('burger-deluxe');
    expect(useShopStore.getState().cartSummary.totalItems).toBe(1);
    clearCart();
    expect(useShopStore.getState().cart).toEqual([]);
    expect(useShopStore.getState().cartSummary.totalItems).toBe(0);

    addToCart('burger-deluxe');
    placeOrder({
      customerName: 'Sam',
      contactNumber: '09170001111',
      fulfillment: 'kiosk-pickup',
      addressOrNotes: '',
      paymentMethod: 'cash',
    });
    expect(useShopStore.getState().lastPlacedOrder).not.toBeNull();
    dismissLastOrder();
    expect(useShopStore.getState().lastPlacedOrder).toBeNull();
    expect(useShopStore.getState().orders).toHaveLength(1);

    const defaultMenuLength = createInitialShopState().menu.length;
    createMenuItem({
      name: 'Limited Griddle Melt',
      category: 'classic-burgers',
      pricePhp: 165,
      pattySpec: '100g Pure Beef',
      description: 'Special batch item.',
      imageUrl: '',
      available: true,
      featured: false,
      allowAddons: true,
    });
    const createdId = useShopStore.getState().menu[0]?.id ?? '';
    addToCart(createdId);
    addToCart('crinkle-cut-fries');
    expect(useShopStore.getState().cartSummary.totalItems).toBe(2);

    resetCatalog();
    expect(useShopStore.getState().menu).toHaveLength(defaultMenuLength);
    expect(useShopStore.getState().cart).toEqual([
      { lineId: 'crinkle-cut-fries', itemId: 'crinkle-cut-fries', quantity: 1, addonIds: [] },
    ]);
    expect(useShopStore.getState().cartSummary.totalItems).toBe(1);
  });

  it('rehydrates persisted Zustand envelopes and legacy flat payloads with computed cartSummary', async () => {
    const defaults = createInitialShopState();
    window.localStorage.setItem(
      SHOP_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          menu: defaults.menu,
          cart: [{ lineId: 'burger-deluxe', itemId: 'burger-deluxe', quantity: 2, addonIds: [] }],
          orders: [],
          nextQueueSeq: 109,
        },
      }),
    );

    await useShopStore.persist.rehydrate();
    expect(useShopStore.getState().nextQueueSeq).toBe(109);
    expect(useShopStore.getState().cartSummary.totalItems).toBe(2);
    expect(useShopStore.getState().cartSummary.subtotalPhp).toBe(296);

    window.localStorage.setItem(
      SHOP_STORAGE_KEY,
      JSON.stringify({
        menu: defaults.menu,
        cart: [
          { lineId: 'crinkle-cut-fries', itemId: 'crinkle-cut-fries', quantity: 3, addonIds: [] },
        ],
        orders: [],
        nextQueueSeq: 120,
      }),
    );

    await useShopStore.persist.rehydrate();
    expect(useShopStore.getState().nextQueueSeq).toBe(120);
    expect(useShopStore.getState().cartSummary.totalItems).toBe(3);
    expect(useShopStore.getState().cartSummary.subtotalPhp).toBe(234);
  });

  it('omits invalid delivery pins and caps persisted order history', () => {
    const { addToCart, placeOrder } = useShopStore.getState().actions;

    addToCart('burger-deluxe');
    placeOrder({
      customerName: 'Guest',
      contactNumber: '',
      fulfillment: 'delivery',
      deliveryPin: { lat: Number.NaN, lng: 999 },
      addressOrNotes: 'Makati',
      paymentMethod: 'cash',
    });

    expect(useShopStore.getState().orders[0]?.deliveryPin).toBeUndefined();

    for (let i = 0; i < MAX_PERSISTED_ORDERS + 5; i += 1) {
      addToCart('crinkle-cut-fries');
      placeOrder({
        customerName: `Guest ${i}`,
        contactNumber: '',
        fulfillment: 'kiosk-pickup',
        addressOrNotes: '',
        paymentMethod: 'cash',
      });
    }

    expect(useShopStore.getState().orders).toHaveLength(MAX_PERSISTED_ORDERS);
  });
});
