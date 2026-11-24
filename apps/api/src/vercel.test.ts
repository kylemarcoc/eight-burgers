import {
  DEFAULT_DELIVERY_PRICING,
  DEFAULT_MENU_CATEGORIES,
  DEFAULT_MENU_ITEMS,
  DEFAULT_OPTION_GROUPS,
  DEFAULT_STORE_PROFILE,
} from '@menu-kiosk/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { ApiConfig } from './config/env';
import type { ShopBackendGateway } from './lib/supabase';
import { createVercelHandler, restoreVercelRequest } from './vercel';

const TEST_CONFIG: ApiConfig = {
  nodeEnv: 'test',
  port: 8787,
  appOrigin: 'https://eight-burgers.vercel.app',
  cookieSecure: true,
  receiptSigningSecret: 'test-dedicated-receipt-signing-secret-0123456789',
  trustProxy: true,
  enableDemoReset: false,
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'test-anon-key',
  supabaseServiceRoleKey: 'test-service-role-key',
};

function createStubGateway(overrides: Partial<ShopBackendGateway> = {}): ShopBackendGateway {
  const unimplemented = (method: string) => () => {
    throw new Error(`Unexpected gateway call in vercel.test.ts: ${method}`);
  };

  return {
    checkDatabaseReady: async () => true,
    getCatalog: async () => ({
      store: DEFAULT_STORE_PROFILE,
      categories: [...DEFAULT_MENU_CATEGORIES],
      optionGroups: [...DEFAULT_OPTION_GROUPS],
      menu: [...DEFAULT_MENU_ITEMS],
      deliveryPricing: DEFAULT_DELIVERY_PRICING,
    }),
    getStoreProfile: async () => DEFAULT_STORE_PROFILE,
    listMenuItems: async () => [...DEFAULT_MENU_ITEMS],
    listMenuCategories: unimplemented('listMenuCategories'),
    createMenuCategory: unimplemented('createMenuCategory'),
    updateMenuCategory: unimplemented('updateMenuCategory'),
    reorderMenuCategories: unimplemented('reorderMenuCategories'),
    deleteMenuCategory: unimplemented('deleteMenuCategory'),
    listOptionGroups: unimplemented('listOptionGroups'),
    createOptionGroup: unimplemented('createOptionGroup'),
    updateOptionGroup: unimplemented('updateOptionGroup'),
    reorderOptionGroups: unimplemented('reorderOptionGroups'),
    deleteOptionGroup: unimplemented('deleteOptionGroup'),
    setOptionChoiceAvailability: unimplemented('setOptionChoiceAvailability'),
    getDeliveryPricing: async () => DEFAULT_DELIVERY_PRICING,
    placeOrder: unimplemented('placeOrder'),
    getOrderByReceipt: unimplemented('getOrderByReceipt'),
    cancelOrderByReceipt: unimplemented('cancelOrderByReceipt'),
    submitPaymentReferenceByReceipt: unimplemented('submitPaymentReferenceByReceipt'),
    getPublicOrderStatusByQueue: unimplemented('getPublicOrderStatusByQueue'),
    cancelPublicOrderByQueue: unimplemented('cancelPublicOrderByQueue'),
    signInAdmin: unimplemented('signInAdmin'),
    verifyAccessToken: unimplemented('verifyAccessToken'),
    refreshAdminSession: unimplemented('refreshAdminSession'),
    signOutAdmin: unimplemented('signOutAdmin'),
    createMenuItem: unimplemented('createMenuItem'),
    updateMenuItem: unimplemented('updateMenuItem'),
    setMenuItemAvailability: unimplemented('setMenuItemAvailability'),
    deleteMenuItem: unimplemented('deleteMenuItem'),
    resetMenuCatalog: unimplemented('resetMenuCatalog'),
    uploadMenuImage: unimplemented('uploadMenuImage'),
    deleteUnusedMenuImage: unimplemented('deleteUnusedMenuImage'),
    uploadStoreAsset: unimplemented('uploadStoreAsset'),
    deleteUnusedStoreAsset: unimplemented('deleteUnusedStoreAsset'),
    updateStoreProfile: unimplemented('updateStoreProfile'),
    updateStoreOrderingStatus: unimplemented('updateStoreOrderingStatus'),
    updateDeliveryPricing: unimplemented('updateDeliveryPricing'),
    resetDeliveryPricing: unimplemented('resetDeliveryPricing'),
    listAdminOrders: unimplemented('listAdminOrders'),
    getAdminOrderById: unimplemented('getAdminOrderById'),
    updateOrderStatus: unimplemented('updateOrderStatus'),
    updateOrderPaymentStatus: unimplemented('updateOrderPaymentStatus'),
    listAdminUsers: unimplemented('listAdminUsers'),
    createAdminUser: unimplemented('createAdminUser'),
    updateAdminUser: unimplemented('updateAdminUser'),
    ...overrides,
  };
}

describe('Vercel serverless adapter', () => {
  it('restores rewritten API paths while preserving query parameters and stripping __vercel_path', () => {
    const rewritten = new Request(
      'https://eight-burgers.vercel.app/api/index?__vercel_path=/api/v1/menu-items&category=classic-burgers&available=true',
    );
    const restored = restoreVercelRequest(rewritten);
    const restoredUrl = new URL(restored.url);

    expect(restoredUrl.pathname).toBe('/api/v1/menu-items');
    expect(restoredUrl.searchParams.get('category')).toBe('classic-burgers');
    expect(restoredUrl.searchParams.get('available')).toBe('true');
    expect(restoredUrl.searchParams.has('__vercel_path')).toBe(false);
  });

  it('ignores disallowed or non-rewrite __vercel_path spoofing attempts', () => {
    const nonRewrite = new Request(
      'https://eight-burgers.vercel.app/api/v1/catalog?__vercel_path=/api/v1/admin/orders',
    );
    const nonRewriteUrl = new URL(restoreVercelRequest(nonRewrite).url);
    expect(nonRewriteUrl.pathname).toBe('/api/v1/catalog');
    expect(nonRewriteUrl.searchParams.has('__vercel_path')).toBe(false);

    const protocolRelative = new Request(
      'https://eight-burgers.vercel.app/api/index?__vercel_path=//evil.example/api',
    );
    expect(new URL(restoreVercelRequest(protocolRelative).url).pathname).toBe('/api/index');

    const nonApiTarget = new Request(
      'https://eight-burgers.vercel.app/api/index?__vercel_path=/admin/settings',
    );
    expect(new URL(restoreVercelRequest(nonApiTarget).url).pathname).toBe('/api/index');
  });

  it('routes rewritten GET requests (/healthz, /readyz, /api/v1/catalog) and caches the app instance', async () => {
    const checkDatabaseReady = vi.fn(async () => true);
    const getCatalog = vi.fn(async () => ({
      store: DEFAULT_STORE_PROFILE,
      categories: [...DEFAULT_MENU_CATEGORIES],
      optionGroups: [...DEFAULT_OPTION_GROUPS],
      menu: [...DEFAULT_MENU_ITEMS],
      deliveryPricing: DEFAULT_DELIVERY_PRICING,
    }));

    const handler = createVercelHandler({
      config: TEST_CONFIG,
      gateway: createStubGateway({ checkDatabaseReady, getCatalog }),
    });

    const healthRes = await handler.fetch(
      new Request('https://eight-burgers.vercel.app/api/index?__vercel_path=/healthz'),
    );
    expect(healthRes.status).toBe(200);
    expect(await healthRes.json()).toEqual({ status: 'ok' });

    const readyRes = await handler.fetch(
      new Request('https://eight-burgers.vercel.app/api/index?__vercel_path=/readyz'),
    );
    expect(readyRes.status).toBe(200);
    expect(await readyRes.json()).toEqual({ status: 'ready' });

    const catalogRes = await handler.fetch(
      new Request('https://eight-burgers.vercel.app/api/index?__vercel_path=/api/v1/catalog'),
    );
    expect(catalogRes.status).toBe(200);
    const catalogJson = (await catalogRes.json()) as { data: { menu: unknown[] } };
    expect(catalogJson.data.menu.length).toBeGreaterThan(0);
    expect(checkDatabaseReady).toHaveBeenCalledTimes(1);
    expect(getCatalog).toHaveBeenCalledTimes(1);
  });

  it('forwards POST request bodies cleanly after restoring the rewritten URL', async () => {
    const placeOrder = vi.fn(async () => ({
      status: 'store_closed' as const,
      closedNotice: 'Temporarily closed for testing.',
    }));
    const handler = createVercelHandler({
      config: TEST_CONFIG,
      gateway: createStubGateway({ placeOrder }),
    });

    const response = await handler.fetch(
      new Request('https://eight-burgers.vercel.app/api/index?__vercel_path=/api/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://eight-burgers.vercel.app',
          'X-Requested-With': 'fetch',
          'Idempotency-Key': 'vercel-test-idempotency-key-0001',
        },
        body: JSON.stringify({
          customerName: 'Alex Rivera',
          contactNumber: '09171234567',
          fulfillment: 'pickup',
          tableNumber: '',
          addressOrNotes: '',
          paymentMethod: 'cash',
          paymentReference: '',
          items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [], itemNote: '' }],
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(placeOrder).toHaveBeenCalledTimes(1);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('STORE_CLOSED');
  });
});
