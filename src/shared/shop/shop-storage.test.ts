import { describe, expect, it } from 'vitest';
import {
  MAKATI_DELIVERY_FEE_PHP,
  buildCartLineId,
  calculateCartDetails,
  createInitialShopState,
  formatPhp,
  shopReducer,
} from './shop-storage';

describe('shopReducer and cart calculations', () => {
  it('merges identical cart lines and calculates add-on surcharges accurately', () => {
    let state = createInitialShopState();

    state = shopReducer(state, {
      type: 'add_to_cart',
      itemId: 'burger-deluxe',
      addonIds: ['bacon', 'sliced-cheese'],
    });
    state = shopReducer(state, {
      type: 'add_to_cart',
      itemId: 'burger-deluxe',
      addonIds: ['sliced-cheese', 'bacon'],
    });

    expect(state.cart).toHaveLength(1);
    expect(state.cart[0]?.lineId).toBe(
      buildCartLineId('burger-deluxe', ['bacon', 'sliced-cheese']),
    );
    expect(state.cart[0]?.quantity).toBe(2);

    const summary = calculateCartDetails(state.cart, state.menu);
    // Burger Deluxe (148) + Sliced Cheese (20) + Crispy Bacon (20) = 188 x 2 = 376
    expect(summary.totalItems).toBe(2);
    expect(summary.subtotalPhp).toBe(376);
    expect(formatPhp(summary.subtotalPhp)).toBe('₱376');
  });

  it('supports incrementing, decrementing, and removing lines', () => {
    let state = createInitialShopState();
    state = shopReducer(state, { type: 'add_to_cart', itemId: 'crinkle-cut-fries' });
    state = shopReducer(state, { type: 'add_to_cart', itemId: 'chicano-burger' });

    state = shopReducer(state, {
      type: 'set_line_quantity',
      lineId: 'crinkle-cut-fries',
      quantity: 3,
    });
    expect(calculateCartDetails(state.cart, state.menu).totalItems).toBe(4);

    state = shopReducer(state, {
      type: 'set_line_quantity',
      lineId: 'chicano-burger',
      quantity: 0,
    });
    expect(state.cart).toHaveLength(1);

    state = shopReducer(state, { type: 'remove_cart_line', lineId: 'crinkle-cut-fries' });
    expect(state.cart).toHaveLength(0);
  });

  it('creates an order ticket on checkout and updates status', () => {
    let state = createInitialShopState();
    state = shopReducer(state, { type: 'add_to_cart', itemId: 'overload-burger' });

    state = shopReducer(state, {
      type: 'place_order',
      customer: {
        customerName: 'Marco',
        contactNumber: '09171234567',
        fulfillment: 'makati-delivery',
        addressOrNotes: 'Eton WestEnd Tower 1',
        paymentMethod: 'gcash',
      },
    });

    expect(state.cart).toHaveLength(0);
    expect(state.orders).toHaveLength(1);
    expect(state.lastPlacedOrder?.queueNumber).toBe('#8B-101');
    expect(state.lastPlacedOrder?.subtotalPhp).toBe(298);
    expect(state.lastPlacedOrder?.deliveryFeePhp).toBe(MAKATI_DELIVERY_FEE_PHP);
    expect(state.lastPlacedOrder?.totalPhp).toBe(298 + MAKATI_DELIVERY_FEE_PHP);

    const orderId = state.orders[0]?.id ?? '';
    state = shopReducer(state, { type: 'update_order_status', orderId, status: 'grilling' });
    expect(state.orders[0]?.status).toBe('grilling');
  });

  it('creates, updates, toggles availability, and deletes menu listings for admin', () => {
    let state = createInitialShopState();
    const initialCount = state.menu.length;

    state = shopReducer(state, {
      type: 'create_menu_item',
      input: {
        name: 'Chino Roces Truffle Melt',
        category: 'specialty-burgers',
        pricePhp: 198,
        pattySpec: '100g Pure Beef',
        description: 'Truffle aioli and double Swiss cheese.',
        imageUrl: '',
        available: true,
        featured: true,
        allowAddons: true,
      },
    });

    expect(state.menu).toHaveLength(initialCount + 1);
    const created = state.menu[0];
    expect(created?.id).toBe('chino-roces-truffle-melt');

    state = shopReducer(state, { type: 'add_to_cart', itemId: created?.id ?? '' });
    expect(state.cart).toHaveLength(1);

    // Toggling sold out clears the unavailable item from active cart
    state = shopReducer(state, { type: 'toggle_item_availability', id: created?.id ?? '' });
    expect(state.menu[0]?.available).toBe(false);
    expect(state.cart).toHaveLength(0);

    state = shopReducer(state, {
      type: 'update_menu_item',
      id: created?.id ?? '',
      input: {
        name: 'Chino Roces Truffle Melt',
        category: 'heavyweights',
        pricePhp: 215,
        pattySpec: 'Double 100g Beef',
        description: 'Upgraded double patty.',
        imageUrl: '',
        available: true,
        featured: true,
        allowAddons: true,
      },
    });
    expect(state.menu[0]?.pricePhp).toBe(215);
    expect(state.menu[0]?.category).toBe('heavyweights');

    state = shopReducer(state, { type: 'delete_menu_item', id: created?.id ?? '' });
    expect(state.menu).toHaveLength(initialCount);
  });
});
