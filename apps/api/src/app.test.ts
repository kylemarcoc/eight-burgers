import {
  DEFAULT_DELIVERY_PRICING,
  DEFAULT_MENU_CATEGORIES,
  DEFAULT_MENU_ITEMS,
  DEFAULT_OPTION_GROUPS,
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_STORE_PROFILE,
  STORE_ORIGIN_COORDS,
  buildCartLineId,
  calculateDeliveryQuote,
  canCustomerCancelOrder,
  normalizeContactDigits,
  normalizeQueueNumber,
  slugifyCategoryId,
  slugifyMenuId,
  slugifyOptionChoiceId,
  slugifyOptionGroupId,
  validateItemOptionSelections,
  type AdminTeamMember,
  type AdminUser,
  type AssetUploadPurpose,
  type DeliveryPricingConfig,
  type GeoCoordinates,
  type MenuCategory,
  type MenuItem,
  type OptionChoice,
  type OptionGroup,
  type OrderRecord,
  type PublicOrderTracker,
  type StoreProfile,
} from '@menu-kiosk/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import type { ApiConfig } from './config/env';
import { extractPaymentMethodQrUrls, getManagedAssetFolder } from './lib/menu-images';
import { SlidingWindowRateLimiter } from './lib/rate-limit';
import type { ShopBackendGateway } from './lib/supabase';

const TEST_CONFIG: ApiConfig = {
  nodeEnv: 'test',
  port: 8787,
  appOrigin: 'http://localhost:5173',
  cookieSecure: false,
  receiptSigningSecret: 'test-dedicated-receipt-signing-secret-0123456789',
  trustProxy: false,
  enableDemoReset: false,
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseAnonKey: 'test-anon-key',
  supabaseServiceRoleKey: 'test-service-role-secret-key-for-hmac',
};

const ADMIN_USER: AdminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'owner@eightburgers.local',
  role: 'owner',
};

const CASHIER_USER: AdminUser = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'cashier@eightburgers.local',
  role: 'cashier',
};

const STAFF_USER: AdminUser = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'staff@eightburgers.local',
  role: 'staff',
};

const TEST_USERS_BY_EMAIL = new Map<string, { user: AdminUser; token: string; refresh: string }>([
  [
    ADMIN_USER.email,
    { user: ADMIN_USER, token: 'valid-access-token', refresh: 'valid-refresh-token' },
  ],
  [
    CASHIER_USER.email,
    { user: CASHIER_USER, token: 'cashier-access-token', refresh: 'cashier-refresh-token' },
  ],
  [
    STAFF_USER.email,
    { user: STAFF_USER, token: 'staff-access-token', refresh: 'staff-refresh-token' },
  ],
]);

const TEST_USERS_BY_TOKEN = new Map<string, AdminUser>([
  ['valid-access-token', ADMIN_USER],
  ['cashier-access-token', CASHIER_USER],
  ['staff-access-token', STAFF_USER],
]);

function toPublicOrderTracker(order: OrderRecord): PublicOrderTracker {
  return {
    queueNumber: order.queueNumber,
    fulfillment: order.fulfillment,
    tableNumber: order.tableNumber,
    paymentStatus: order.paymentStatus,
    ...(order.deliveryEtaMinutes ? { deliveryEtaMinutes: order.deliveryEtaMinutes } : {}),
    lines: order.lines.map((line) => {
      const optionNames =
        line.selectedOptions.length > 0
          ? line.selectedOptions.map((opt) => opt.choiceName)
          : line.addonNames;
      return {
        lineId: line.lineId,
        name: line.name,
        quantity: line.quantity,
        addonNames: optionNames,
        selectedOptionNames: optionNames,
      };
    }),
    status: order.status,
    createdAtIso: order.createdAtIso,
    ...(order.updatedAt ? { updatedAt: order.updatedAt } : {}),
  };
}

function createFakeGateway(overrides: Partial<ShopBackendGateway> = {}): {
  gateway: ShopBackendGateway;
  state: {
    storeProfile: StoreProfile;
    categories: MenuCategory[];
    optionGroups: OptionGroup[];
    menu: MenuItem[];
    deliveryPricing: DeliveryPricingConfig;
    orders: Map<
      string,
      { order: OrderRecord; idempotencyKey: string; payloadHash: string; receiptTokenHash: string }
    >;
    team: AdminTeamMember[];
    uploadedImages: Set<string>;
    seq: number;
    userSeq: number;
  };
} {
  const state: {
    storeProfile: StoreProfile;
    categories: MenuCategory[];
    optionGroups: OptionGroup[];
    menu: MenuItem[];
    deliveryPricing: DeliveryPricingConfig;
    orders: Map<
      string,
      { order: OrderRecord; idempotencyKey: string; payloadHash: string; receiptTokenHash: string }
    >;
    team: AdminTeamMember[];
    uploadedImages: Set<string>;
    seq: number;
    userSeq: number;
  } = {
    storeProfile: {
      ...DEFAULT_STORE_PROFILE,
      storeName: '8Burgers',
      branchLabel: 'Chino Roces, Makati',
      monogram: '8B',
      queuePrefix: '8B',
      preparingStageLabel: 'On the Grill',
      pickupEnabled: true,
      deliveryEnabled: true,
      dineInEnabled: false,
      dineInTableRequired: true,
      paymentMethods: {
        cash: { ...DEFAULT_PAYMENT_METHODS.cash, enabled: true },
        gcash: { ...DEFAULT_PAYMENT_METHODS.gcash, enabled: true },
        maya: { ...DEFAULT_PAYMENT_METHODS.maya, enabled: true },
        bank_transfer: { ...DEFAULT_PAYMENT_METHODS.bank_transfer, enabled: false },
      },
      originCoords: { ...STORE_ORIGIN_COORDS },
      updatedAt: '2026-11-22T01:00:00.000Z',
      version: 1,
    },
    categories: DEFAULT_MENU_CATEGORIES.map((category) => ({
      ...category,
      updatedAt: '2026-11-22T01:00:00.000Z',
      version: 1,
    })),
    optionGroups: DEFAULT_OPTION_GROUPS.map((group) => ({
      ...group,
      choices: group.choices.map((choice) => ({
        ...choice,
        updatedAt: '2026-11-22T01:00:00.000Z',
        version: 1,
      })),
      updatedAt: '2026-11-22T01:00:00.000Z',
      version: 1,
    })),
    menu: DEFAULT_MENU_ITEMS.map((item, idx) => ({
      ...item,
      optionGroupIds: [...item.optionGroupIds],
      sortOrder: idx + 1,
      updatedAt: '2026-11-22T01:00:00.000Z',
      version: 1,
    })),
    deliveryPricing: {
      ...DEFAULT_DELIVERY_PRICING,
      originCoords: { ...STORE_ORIGIN_COORDS },
      updatedAt: '2026-11-22T01:00:00.000Z',
      version: 1,
    },
    orders: new Map<
      string,
      { order: OrderRecord; idempotencyKey: string; payloadHash: string; receiptTokenHash: string }
    >(),
    team: [ADMIN_USER, CASHIER_USER, STAFF_USER].map((user) => ({
      ...user,
      active: true,
      createdAt: '2026-11-22T01:00:00.000Z',
      updatedAt: '2026-11-22T01:00:00.000Z',
    })),
    uploadedImages: new Set<string>(),
    seq: 101,
    userSeq: 4,
  };

  const syncSettingsVersion = (nextVersion: number, updatedAt: string) => {
    state.storeProfile = { ...state.storeProfile, version: nextVersion, updatedAt };
    state.deliveryPricing = {
      ...state.deliveryPricing,
      deliveryEnabled: state.storeProfile.deliveryEnabled,
      originCoords: state.storeProfile.originCoords,
      version: nextVersion,
      updatedAt,
    };
  };

  const isAssetReferenced = (imageUrl: string): boolean =>
    state.menu.some((item) => item.imageUrl === imageUrl) ||
    state.storeProfile.logoUrl === imageUrl ||
    state.storeProfile.heroImageUrl === imageUrl ||
    extractPaymentMethodQrUrls(state.storeProfile.paymentMethods).includes(imageUrl);

  const gateway: ShopBackendGateway = {
    checkDatabaseReady: async () => true,
    getCatalog: async () => ({
      store: state.storeProfile,
      categories: [...state.categories].sort((a, b) => a.sortOrder - b.sortOrder),
      optionGroups: [...state.optionGroups].sort((a, b) => a.sortOrder - b.sortOrder),
      menu: state.menu,
      deliveryPricing: state.deliveryPricing,
    }),
    getStoreProfile: async () => state.storeProfile,
    listMenuItems: async (filters) =>
      state.menu.filter((item) => {
        if (filters.category && item.category !== filters.category) return false;
        if (typeof filters.available === 'boolean' && item.available !== filters.available) {
          return false;
        }
        if (filters.q && !item.name.toLowerCase().includes(filters.q.toLowerCase())) return false;
        return true;
      }),
    listMenuCategories: async () => [...state.categories].sort((a, b) => a.sortOrder - b.sortOrder),
    createMenuCategory: async (_token, input) => {
      const existingIds = new Set(state.categories.map((entry) => entry.id));
      const id = input.id ?? slugifyCategoryId(input.name, existingIds);
      if (existingIds.has(id)) {
        return { status: 'conflict_slug' };
      }
      const maxSort = state.categories.reduce((max, entry) => Math.max(max, entry.sortOrder), 0);
      const created: MenuCategory = {
        id,
        name: input.name,
        description: input.description,
        sortOrder: input.sortOrder ?? maxSort + 1,
        active: input.active,
        updatedAt: '2026-11-22T03:00:00.000Z',
        version: 1,
      };
      state.categories.push(created);
      return { status: 'ok', data: created };
    },
    updateMenuCategory: async (_token, id, patch, expectedVersion) => {
      const idx = state.categories.findIndex((entry) => entry.id === id);
      if (idx === -1) return { status: 'not_found' };
      const existing = state.categories[idx];
      if (!existing) return { status: 'not_found' };
      if (expectedVersion !== undefined && existing.version !== expectedVersion) {
        return { status: 'conflict', latest: existing };
      }
      const updated: MenuCategory = {
        ...existing,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
        updatedAt: '2026-11-22T04:00:00.000Z',
        version: (existing.version ?? 1) + 1,
      };
      state.categories[idx] = updated;
      return { status: 'ok', data: updated };
    },
    reorderMenuCategories: async (_token, orderedIds) => {
      const byId = new Map(state.categories.map((entry) => [entry.id, entry]));
      const next: MenuCategory[] = [];
      const seen = new Set<string>();
      for (const id of orderedIds) {
        const match = byId.get(id);
        if (match && !seen.has(id)) {
          seen.add(id);
          next.push(match);
        }
      }
      for (const entry of state.categories) {
        if (!seen.has(entry.id)) {
          seen.add(entry.id);
          next.push(entry);
        }
      }
      state.categories = next.map((entry, idx) => ({
        ...entry,
        sortOrder: idx + 1,
        version: (entry.version ?? 1) + 1,
      }));
      return [...state.categories];
    },
    deleteMenuCategory: async (_token, id) => {
      const exists = state.categories.some((entry) => entry.id === id);
      if (!exists) return 'not_found';
      if (state.menu.some((item) => item.category === id)) {
        return 'in_use';
      }
      state.categories = state.categories.filter((entry) => entry.id !== id);
      return 'deleted';
    },
    listOptionGroups: async () => [...state.optionGroups].sort((a, b) => a.sortOrder - b.sortOrder),
    createOptionGroup: async (_token, input) => {
      const existingGroupIds = new Set(state.optionGroups.map((entry) => entry.id));
      const existingChoiceIds = new Set(
        state.optionGroups.flatMap((group) => group.choices.map((choice) => choice.id)),
      );
      const id = input.id ?? slugifyOptionGroupId(input.name, existingGroupIds);
      if (existingGroupIds.has(id)) {
        return { status: 'conflict_slug' };
      }
      const choices: OptionChoice[] = [];
      for (let idx = 0; idx < input.choices.length; idx += 1) {
        const choice = input.choices[idx];
        if (!choice) continue;
        const choiceId = choice.id ?? slugifyOptionChoiceId(choice.name, existingChoiceIds);
        if (existingChoiceIds.has(choiceId)) {
          return { status: 'conflict_slug' };
        }
        existingChoiceIds.add(choiceId);
        choices.push({
          id: choiceId,
          groupId: id,
          name: choice.name,
          priceDeltaPhp: choice.priceDeltaPhp,
          available: choice.available,
          isDefault: choice.isDefault,
          sortOrder: choice.sortOrder ?? idx + 1,
          updatedAt: '2026-11-22T03:00:00.000Z',
          version: 1,
        });
      }
      const maxSort = state.optionGroups.reduce((max, entry) => Math.max(max, entry.sortOrder), 0);
      const created: OptionGroup = {
        id,
        name: input.name,
        description: input.description,
        selectionMode: input.selectionMode,
        required: input.required,
        minSelect: input.minSelect,
        maxSelect: input.maxSelect,
        sortOrder: input.sortOrder ?? maxSort + 1,
        active: input.active,
        choices,
        updatedAt: '2026-11-22T03:00:00.000Z',
        version: 1,
      };
      state.optionGroups.push(created);
      return { status: 'ok', data: created };
    },
    updateOptionGroup: async (_token, id, patch, expectedVersion) => {
      const idx = state.optionGroups.findIndex((entry) => entry.id === id);
      if (idx === -1) return { status: 'not_found' };
      const existing = state.optionGroups[idx];
      if (!existing) return { status: 'not_found' };
      if (expectedVersion !== undefined && existing.version !== expectedVersion) {
        return { status: 'conflict', latest: existing };
      }
      const nextSelectionMode = patch.selectionMode ?? existing.selectionMode;
      const nextRequired = patch.required ?? existing.required;
      const nextMinSelect = patch.minSelect ?? existing.minSelect;
      const nextMaxSelect = patch.maxSelect !== undefined ? patch.maxSelect : existing.maxSelect;
      if (nextSelectionMode === 'single' && nextMaxSelect !== 1) {
        return {
          status: 'validation_error',
          field: 'maxSelect',
          message: 'Single-select option groups must have maxSelect equal to 1.',
        };
      }
      if (nextRequired && nextMinSelect < 1) {
        return {
          status: 'validation_error',
          field: 'minSelect',
          message: 'Required option groups must require at least 1 selection.',
        };
      }
      if (nextMaxSelect !== null && nextMaxSelect < nextMinSelect) {
        return {
          status: 'validation_error',
          field: 'maxSelect',
          message: 'Maximum selections cannot be less than minimum selections.',
        };
      }
      const choicesForCheck = patch.choices ?? existing.choices;
      if (
        nextSelectionMode === 'single' &&
        choicesForCheck.filter((choice) => choice.isDefault).length > 1
      ) {
        return {
          status: 'validation_error',
          field: 'choices',
          message: 'Single-select option groups can have at most one default choice.',
        };
      }

      let nextChoices = existing.choices;
      if (patch.choices !== undefined) {
        const otherChoiceIds = new Set(
          state.optionGroups
            .filter((group) => group.id !== id)
            .flatMap((group) => group.choices.map((choice) => choice.id)),
        );
        const allChoiceIds = new Set([
          ...otherChoiceIds,
          ...existing.choices.map((choice) => choice.id),
        ]);
        const seen = new Set<string>();
        const built: OptionChoice[] = [];
        for (let i = 0; i < patch.choices.length; i += 1) {
          const choice = patch.choices[i];
          if (!choice) continue;
          const choiceId = choice.id ?? slugifyOptionChoiceId(choice.name, allChoiceIds);
          if (otherChoiceIds.has(choiceId) || seen.has(choiceId)) {
            return { status: 'conflict_slug' };
          }
          allChoiceIds.add(choiceId);
          seen.add(choiceId);
          const prev = existing.choices.find((entry) => entry.id === choiceId);
          built.push({
            id: choiceId,
            groupId: id,
            name: choice.name,
            priceDeltaPhp: choice.priceDeltaPhp,
            available: choice.available,
            isDefault: choice.isDefault,
            sortOrder: choice.sortOrder ?? i + 1,
            updatedAt: '2026-11-22T04:00:00.000Z',
            version: (prev?.version ?? 0) + 1,
          });
        }
        nextChoices = built;
      }

      const updated: OptionGroup = {
        ...existing,
        name: patch.name ?? existing.name,
        description: patch.description ?? existing.description,
        selectionMode: nextSelectionMode,
        required: nextRequired,
        minSelect: nextMinSelect,
        maxSelect: nextMaxSelect,
        sortOrder: patch.sortOrder ?? existing.sortOrder,
        active: patch.active ?? existing.active,
        choices: nextChoices,
        updatedAt: '2026-11-22T04:00:00.000Z',
        version: (existing.version ?? 1) + 1,
      };
      state.optionGroups[idx] = updated;
      return { status: 'ok', data: updated };
    },
    reorderOptionGroups: async (_token, orderedIds) => {
      const byId = new Map(state.optionGroups.map((entry) => [entry.id, entry]));
      const next: OptionGroup[] = [];
      const seen = new Set<string>();
      for (const id of orderedIds) {
        const match = byId.get(id);
        if (match && !seen.has(id)) {
          seen.add(id);
          next.push(match);
        }
      }
      for (const entry of state.optionGroups) {
        if (!seen.has(entry.id)) {
          seen.add(entry.id);
          next.push(entry);
        }
      }
      state.optionGroups = next.map((entry, idx) => ({
        ...entry,
        sortOrder: idx + 1,
        version: (entry.version ?? 1) + 1,
      }));
      return [...state.optionGroups];
    },
    deleteOptionGroup: async (_token, id) => {
      const exists = state.optionGroups.some((entry) => entry.id === id);
      if (!exists) return 'not_found';
      if (state.menu.some((item) => item.optionGroupIds.includes(id))) {
        return 'in_use';
      }
      state.optionGroups = state.optionGroups.filter((entry) => entry.id !== id);
      return 'deleted';
    },
    setOptionChoiceAvailability: async (_token, id, available, expectedVersion) => {
      for (const group of state.optionGroups) {
        const choiceIdx = group.choices.findIndex((choice) => choice.id === id);
        if (choiceIdx === -1) continue;
        const existing = group.choices[choiceIdx];
        if (!existing) continue;
        if (expectedVersion !== undefined && existing.version !== expectedVersion) {
          return { status: 'conflict', latest: existing };
        }
        const updated: OptionChoice = {
          ...existing,
          available,
          updatedAt: '2026-11-22T04:30:00.000Z',
          version: (existing.version ?? 1) + 1,
        };
        group.choices[choiceIdx] = updated;
        return { status: 'ok', data: updated };
      }
      return { status: 'not_found' };
    },
    getDeliveryPricing: async () => state.deliveryPricing,
    placeOrder: async ({ idempotencyKey, payloadHash, receiptTokenHash, request }) => {
      for (const existing of state.orders.values()) {
        if (existing.idempotencyKey === idempotencyKey) {
          if (existing.payloadHash !== payloadHash) {
            return { status: 'idempotency_conflict' };
          }
          return { status: 'ok', replayed: true, order: existing.order };
        }
      }

      if (!state.storeProfile.acceptingOrders) {
        return {
          status: 'store_closed',
          closedNotice: state.storeProfile.closedNotice,
        };
      }

      if (request.fulfillment === 'pickup' && !state.storeProfile.pickupEnabled) {
        return { status: 'fulfillment_unavailable' };
      }
      if (request.fulfillment === 'dine-in') {
        if (!state.storeProfile.dineInEnabled) {
          return { status: 'fulfillment_unavailable' };
        }
        if (state.storeProfile.dineInTableRequired && !request.tableNumber.trim()) {
          return { status: 'table_number_required' };
        }
      }
      if (!state.storeProfile.paymentMethods[request.paymentMethod]?.enabled) {
        return { status: 'payment_method_unavailable' };
      }

      let subtotal = 0;
      const lines = [];
      for (const reqLine of request.items) {
        const item = state.menu.find((entry) => entry.id === reqLine.itemId);
        if (!item || !item.available) {
          return { status: 'item_unavailable', itemId: reqLine.itemId };
        }
        const validation = validateItemOptionSelections(
          item,
          reqLine.selectedOptionIds,
          state.optionGroups,
        );
        if (!validation.valid) {
          const firstIssue = validation.issues[0];
          if (firstIssue?.code === 'INVALID_OPTION_SELECTION') {
            return {
              status: 'invalid_option_selection',
              ...(firstIssue.choiceId ? { optionId: firstIssue.choiceId } : {}),
            };
          }
          if (firstIssue?.code === 'OPTION_UNAVAILABLE') {
            return {
              status: 'option_unavailable',
              ...(firstIssue.choiceId ? { optionId: firstIssue.choiceId } : {}),
            };
          }
          if (firstIssue?.code === 'REQUIRED_OPTION_MISSING') {
            return {
              status: 'required_option_missing',
              ...(firstIssue.groupId ? { groupId: firstIssue.groupId } : {}),
            };
          }
          if (firstIssue?.code === 'OPTION_LIMIT_EXCEEDED') {
            return {
              status: 'option_limit_exceeded',
              ...(firstIssue.groupId ? { groupId: firstIssue.groupId } : {}),
            };
          }
        }
        const itemNote = reqLine.itemNote.trim();
        const lineTotal = (item.pricePhp + validation.addonsPricePhp) * reqLine.quantity;
        subtotal += lineTotal;
        lines.push({
          lineId: buildCartLineId(item.id, reqLine.selectedOptionIds, itemNote),
          itemId: item.id,
          name: item.name,
          unitPricePhp: item.pricePhp,
          selectedOptions: validation.selectedOptions,
          addonNames: validation.selectedOptions.map((option) => option.choiceName),
          itemNote,
          addonsPricePhp: validation.addonsPricePhp,
          quantity: reqLine.quantity,
          lineTotalPhp: lineTotal,
        });
      }

      if (
        request.fulfillment === 'delivery' &&
        (!state.deliveryPricing.deliveryEnabled || !state.deliveryPricing.originCoords)
      ) {
        return { status: 'delivery_unavailable' };
      }
      if (request.fulfillment === 'delivery' && !request.deliveryPin) {
        return { status: 'delivery_pin_required' };
      }

      const quote = calculateDeliveryQuote({
        fulfillment: request.fulfillment,
        subtotalPhp: subtotal,
        deliveryPricing: state.deliveryPricing,
        pin: request.deliveryPin,
      });

      if (request.fulfillment === 'delivery' && quote.outOfRange) {
        return { status: 'out_of_delivery_range' };
      }
      if (request.fulfillment === 'delivery' && !quote.available) {
        return { status: 'delivery_unavailable' };
      }

      const deliveryFeePhp = quote.feePhp;
      const totalPhp = subtotal + deliveryFeePhp;
      if (request.expectedTotalPhp !== undefined && request.expectedTotalPhp !== totalPhp) {
        return { status: 'price_changed', latestTotalPhp: totalPhp };
      }

      const seq = state.seq;
      state.seq += 1;
      const cleanPaymentRef =
        request.paymentMethod !== 'cash' ? request.paymentReference.trim() : '';
      const order: OrderRecord = {
        id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
        queueNumber: `#${state.storeProfile.queuePrefix || 'ORD'}-${seq}`,
        customerName: request.customerName,
        contactNumber: request.contactNumber,
        fulfillment: request.fulfillment,
        tableNumber: request.fulfillment === 'dine-in' ? request.tableNumber.trim() : '',
        ...(request.fulfillment === 'delivery' && request.deliveryPin
          ? { deliveryPin: request.deliveryPin }
          : {}),
        ...(quote.distanceKm !== null ? { deliveryDistanceKm: quote.distanceKm } : {}),
        ...(quote.etaMinutes ? { deliveryEtaMinutes: quote.etaMinutes } : {}),
        ...(quote.isFreeDelivery ? { deliveryFeeWaived: true } : {}),
        addressOrNotes: request.addressOrNotes,
        paymentMethod: request.paymentMethod,
        paymentStatus: cleanPaymentRef ? 'pending_verification' : 'unpaid',
        paymentReference: cleanPaymentRef,
        lines,
        subtotalPhp: subtotal,
        deliveryFeePhp,
        totalPhp,
        status: 'received',
        createdAtIso: '2026-11-22T02:00:00.000Z',
        updatedAt: '2026-11-22T02:00:00.000Z',
        version: 1,
      };
      state.orders.set(order.id, { order, idempotencyKey, payloadHash, receiptTokenHash });
      return { status: 'ok', replayed: false, order };
    },
    getOrderByReceipt: async (orderId, receiptTokenHash) => {
      const entry = state.orders.get(orderId);
      if (!entry || entry.receiptTokenHash !== receiptTokenHash) return null;
      return entry.order;
    },
    cancelOrderByReceipt: async (orderId, receiptTokenHash) => {
      const entry = state.orders.get(orderId);
      if (!entry || entry.receiptTokenHash !== receiptTokenHash) {
        return { status: 'not_found' };
      }
      if (entry.order.status === 'cancelled') {
        return { status: 'ok', order: entry.order };
      }
      if (!canCustomerCancelOrder(entry.order)) {
        return { status: 'not_cancellable', order: entry.order };
      }
      entry.order = {
        ...entry.order,
        status: 'cancelled',
        updatedAt: '2026-11-22T05:00:00.000Z',
        version: (entry.order.version ?? 1) + 1,
      };
      return { status: 'ok', order: entry.order };
    },
    submitPaymentReferenceByReceipt: async (orderId, receiptTokenHash, paymentReference) => {
      const entry = state.orders.get(orderId);
      if (!entry || entry.receiptTokenHash !== receiptTokenHash) {
        return { status: 'not_found' };
      }
      const cleanRef = paymentReference.trim();
      if (!cleanRef || cleanRef.length > 80) {
        return { status: 'invalid_reference', order: entry.order };
      }
      if (entry.order.paymentMethod === 'cash') {
        return { status: 'cash_not_applicable', order: entry.order };
      }
      if (entry.order.status === 'cancelled') {
        return { status: 'order_cancelled', order: entry.order };
      }
      if (entry.order.paymentStatus === 'paid') {
        return { status: 'already_paid', order: entry.order };
      }
      entry.order = {
        ...entry.order,
        paymentReference: cleanRef,
        paymentStatus: 'pending_verification',
        updatedAt: '2026-11-22T04:45:00.000Z',
        version: (entry.order.version ?? 1) + 1,
      };
      return { status: 'ok', order: entry.order };
    },
    getPublicOrderStatusByQueue: async (queueNumber) => {
      const normalized = normalizeQueueNumber(queueNumber, state.storeProfile.queuePrefix);
      const entry = [...state.orders.values()]
        .reverse()
        .find((item) => item.order.queueNumber.toUpperCase() === normalized.toUpperCase());
      return entry ? toPublicOrderTracker(entry.order) : null;
    },
    cancelPublicOrderByQueue: async (queueNumber, verification) => {
      const normalized = normalizeQueueNumber(queueNumber, state.storeProfile.queuePrefix);
      const entry = [...state.orders.values()]
        .reverse()
        .find((item) => item.order.queueNumber.toUpperCase() === normalized.toUpperCase());
      if (!entry) return { status: 'not_found' };

      const orderDigits = normalizeContactDigits(entry.order.contactNumber);
      const inputDigits = normalizeContactDigits(verification.contactNumber ?? '');
      const orderName = entry.order.customerName.trim().replace(/\s+/g, ' ').toLowerCase();
      const inputName = (verification.customerName ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

      const verified =
        entry.order.fulfillment === 'delivery'
          ? Boolean(orderDigits && inputDigits && orderDigits === inputDigits)
          : Boolean(
              (orderName && inputName && orderName === inputName) ||
              (orderDigits && inputDigits && orderDigits === inputDigits),
            );

      if (!verified) {
        return { status: 'verification_failed' };
      }

      if (entry.order.status === 'cancelled') {
        return { status: 'ok', tracker: toPublicOrderTracker(entry.order) };
      }
      if (!canCustomerCancelOrder(entry.order)) {
        return { status: 'not_cancellable', tracker: toPublicOrderTracker(entry.order) };
      }

      entry.order = {
        ...entry.order,
        status: 'cancelled',
        updatedAt: '2026-11-22T05:00:00.000Z',
        version: (entry.order.version ?? 1) + 1,
      };
      return { status: 'ok', tracker: toPublicOrderTracker(entry.order) };
    },
    signInAdmin: async (email, password) => {
      if (email === 'nonadmin@eightburgers.local' && password === 'valid-pass') {
        return { status: 'forbidden' };
      }
      const matched = TEST_USERS_BY_EMAIL.get(email);
      if (matched && password === 'EightBurgersDev123!') {
        return {
          status: 'ok',
          user: matched.user,
          tokens: {
            accessToken: matched.token,
            refreshToken: matched.refresh,
            expiresInSeconds: 3600,
          },
        };
      }
      return { status: 'invalid_credentials' };
    },
    verifyAccessToken: async (token) => TEST_USERS_BY_TOKEN.get(token) ?? null,
    refreshAdminSession: async (refreshToken) =>
      refreshToken === 'valid-refresh-token'
        ? {
            user: ADMIN_USER,
            tokens: {
              accessToken: 'valid-access-token',
              refreshToken: 'rotated-refresh-token',
              expiresInSeconds: 3600,
            },
          }
        : null,
    signOutAdmin: async () => undefined,
    createMenuItem: async (_token, input) => {
      if (!state.categories.some((category) => category.id === input.category)) {
        return { status: 'invalid_reference', detail: 'Selected category does not exist.' };
      }
      for (const groupId of input.optionGroupIds) {
        if (!state.optionGroups.some((group) => group.id === groupId)) {
          return {
            status: 'invalid_reference',
            detail: 'One or more selected option groups do not exist.',
          };
        }
      }
      const existingIds = new Set(state.menu.map((item) => item.id));
      const created: MenuItem = {
        id: slugifyMenuId(input.name, existingIds),
        ...input,
        updatedAt: '2026-11-22T03:00:00.000Z',
        version: 1,
      };
      state.menu.unshift(created);
      return { status: 'ok', data: created };
    },
    updateMenuItem: async (_token, id, input, expectedVersion) => {
      const idx = state.menu.findIndex((item) => item.id === id);
      if (idx === -1) return { status: 'not_found' };
      const existing = state.menu[idx];
      if (!existing) return { status: 'not_found' };
      if (!state.categories.some((category) => category.id === input.category)) {
        return { status: 'invalid_reference', detail: 'Selected category does not exist.' };
      }
      for (const groupId of input.optionGroupIds) {
        if (!state.optionGroups.some((group) => group.id === groupId)) {
          return {
            status: 'invalid_reference',
            detail: 'One or more selected option groups do not exist.',
          };
        }
      }
      if (expectedVersion !== undefined && existing.version !== expectedVersion) {
        return { status: 'conflict', latest: existing };
      }
      const updated: MenuItem = {
        ...existing,
        ...input,
        updatedAt: '2026-11-22T04:00:00.000Z',
        version: (existing.version ?? 1) + 1,
      };
      state.menu[idx] = updated;
      return { status: 'ok', data: updated };
    },
    setMenuItemAvailability: async (_token, id, available, expectedVersion) => {
      const idx = state.menu.findIndex((item) => item.id === id);
      if (idx === -1) return { status: 'not_found' };
      const existing = state.menu[idx];
      if (!existing) return { status: 'not_found' };
      if (expectedVersion !== undefined && existing.version !== expectedVersion) {
        return { status: 'conflict', latest: existing };
      }
      const updated: MenuItem = {
        ...existing,
        available,
        updatedAt: '2026-11-22T04:00:00.000Z',
        version: (existing.version ?? 1) + 1,
      };
      state.menu[idx] = updated;
      return { status: 'ok', data: updated };
    },
    deleteMenuItem: async (_token, id) => {
      const target = state.menu.find((item) => item.id === id);
      const prevLen = state.menu.length;
      state.menu = state.menu.filter((item) => item.id !== id);
      if (target && !state.menu.some((item) => item.imageUrl === target.imageUrl)) {
        state.uploadedImages.delete(target.imageUrl);
      }
      return state.menu.length < prevLen ? 'deleted' : 'not_found';
    },
    resetMenuCatalog: async () => {
      state.uploadedImages.clear();
      return state.menu;
    },
    uploadMenuImage: async () => {
      const seq = state.seq;
      state.seq += 1;
      const path = `items/00000000-0000-4000-8000-${String(seq).padStart(12, '0')}.webp`;
      const imageUrl = `/storage/v1/object/public/menu-images/${path}`;
      state.uploadedImages.add(imageUrl);
      return { path, imageUrl };
    },
    deleteUnusedMenuImage: async (_token, imageUrl) => {
      if (isAssetReferenced(imageUrl)) {
        return 'ignored';
      }
      return state.uploadedImages.delete(imageUrl) ? 'deleted' : 'ignored';
    },
    uploadStoreAsset: async (_token, file) => {
      const seq = state.seq;
      state.seq += 1;
      const folder = getManagedAssetFolder(file.purpose);
      const path = `${folder}/00000000-0000-4000-8000-${String(seq).padStart(12, '0')}.webp`;
      const imageUrl = `/storage/v1/object/public/menu-images/${path}`;
      state.uploadedImages.add(imageUrl);
      return { path, imageUrl };
    },
    deleteUnusedStoreAsset: async (_token, imageUrl) => {
      if (isAssetReferenced(imageUrl)) {
        return 'ignored';
      }
      return state.uploadedImages.delete(imageUrl) ? 'deleted' : 'ignored';
    },
    updateStoreProfile: async (_token, patch, expectedVersion) => {
      if (expectedVersion !== undefined && state.storeProfile.version !== expectedVersion) {
        return { status: 'conflict', latest: state.storeProfile };
      }
      const nextPickup = patch.pickupEnabled ?? state.storeProfile.pickupEnabled;
      const nextDelivery = patch.deliveryEnabled ?? state.storeProfile.deliveryEnabled;
      const nextDineIn = patch.dineInEnabled ?? state.storeProfile.dineInEnabled;
      if (!nextPickup && !nextDelivery && !nextDineIn) {
        return { status: 'fulfillment_required' };
      }
      const nextOrigin =
        patch.originCoords !== undefined ? patch.originCoords : state.storeProfile.originCoords;
      if (nextDelivery && !nextOrigin) {
        return { status: 'origin_required_for_delivery' };
      }
      const prevLogo = state.storeProfile.logoUrl;
      const prevHero = state.storeProfile.heroImageUrl;
      const prevQrUrls = extractPaymentMethodQrUrls(state.storeProfile.paymentMethods);
      const nextVersion = (state.storeProfile.version ?? 1) + 1;
      const updatedAt = '2026-11-22T04:15:00.000Z';
      state.storeProfile = {
        ...state.storeProfile,
        ...patch,
        updatedAt,
        version: nextVersion,
      };
      syncSettingsVersion(nextVersion, updatedAt);
      if (prevLogo && prevLogo !== state.storeProfile.logoUrl && !isAssetReferenced(prevLogo)) {
        state.uploadedImages.delete(prevLogo);
      }
      if (
        prevHero &&
        prevHero !== state.storeProfile.heroImageUrl &&
        !isAssetReferenced(prevHero)
      ) {
        state.uploadedImages.delete(prevHero);
      }
      const afterQrUrls = new Set(extractPaymentMethodQrUrls(state.storeProfile.paymentMethods));
      for (const prevQr of prevQrUrls) {
        if (!afterQrUrls.has(prevQr) && !isAssetReferenced(prevQr)) {
          state.uploadedImages.delete(prevQr);
        }
      }
      return { status: 'ok', data: state.storeProfile };
    },
    updateStoreOrderingStatus: async (_token, patch, expectedVersion) => {
      if (expectedVersion !== undefined && state.storeProfile.version !== expectedVersion) {
        return { status: 'conflict', latest: state.storeProfile };
      }
      const nextVersion = (state.storeProfile.version ?? 1) + 1;
      const updatedAt = '2026-11-22T04:20:00.000Z';
      state.storeProfile = {
        ...state.storeProfile,
        acceptingOrders: patch.acceptingOrders,
        ...(patch.closedNotice !== undefined ? { closedNotice: patch.closedNotice } : {}),
        updatedAt,
        version: nextVersion,
      };
      syncSettingsVersion(nextVersion, updatedAt);
      return { status: 'ok', data: state.storeProfile };
    },
    updateDeliveryPricing: async (_token, patch, expectedVersion) => {
      if (expectedVersion !== undefined && state.deliveryPricing.version !== expectedVersion) {
        return { status: 'conflict', latest: state.deliveryPricing };
      }
      if (patch.deliveryEnabled === true && !state.storeProfile.originCoords) {
        return { status: 'origin_required_for_delivery' };
      }
      if (
        patch.deliveryEnabled === false &&
        !state.storeProfile.pickupEnabled &&
        !state.storeProfile.dineInEnabled
      ) {
        return { status: 'fulfillment_required' };
      }
      const nextVersion = (state.deliveryPricing.version ?? 1) + 1;
      const updatedAt = '2026-11-22T04:00:00.000Z';
      if (patch.deliveryEnabled !== undefined) {
        state.storeProfile = { ...state.storeProfile, deliveryEnabled: patch.deliveryEnabled };
      }
      state.deliveryPricing = {
        ...state.deliveryPricing,
        ...(patch.deliveryEnabled !== undefined ? { deliveryEnabled: patch.deliveryEnabled } : {}),
        ...(patch.baseFeePhp !== undefined ? { baseFeePhp: patch.baseFeePhp } : {}),
        ...(patch.perKmRatePhp !== undefined ? { perKmRatePhp: patch.perKmRatePhp } : {}),
        ...(patch.maxDistanceKm !== undefined
          ? { maxDistanceKm: Math.round(patch.maxDistanceKm * 10) / 10 }
          : {}),
        ...(patch.freeDeliveryMinSubtotalPhp !== undefined
          ? { freeDeliveryMinSubtotalPhp: patch.freeDeliveryMinSubtotalPhp }
          : {}),
        originCoords: state.storeProfile.originCoords,
        updatedAt,
        version: nextVersion,
      };
      syncSettingsVersion(nextVersion, updatedAt);
      return { status: 'ok', data: state.deliveryPricing };
    },
    resetDeliveryPricing: async () => {
      const nextVersion = (state.deliveryPricing.version ?? 1) + 1;
      const updatedAt = '2026-11-22T05:00:00.000Z';
      const hasOriginPin = state.storeProfile.originCoords !== null;
      const nextDeliveryEnabled = hasOriginPin ? DEFAULT_DELIVERY_PRICING.deliveryEnabled : false;
      state.storeProfile = { ...state.storeProfile, deliveryEnabled: nextDeliveryEnabled };
      state.deliveryPricing = {
        ...DEFAULT_DELIVERY_PRICING,
        deliveryEnabled: nextDeliveryEnabled,
        originCoords: state.storeProfile.originCoords,
        updatedAt,
        version: nextVersion,
      };
      syncSettingsVersion(nextVersion, updatedAt);
      return state.deliveryPricing;
    },
    listAdminOrders: async (_token, params) => {
      const allOrders = [...state.orders.values()].map((entry) => entry.order);
      const queryLower = params.q?.trim().toLowerCase() ?? '';
      const searchFiltered = allOrders.filter((order) => {
        if (queryLower) {
          const hit =
            order.queueNumber.toLowerCase().includes(queryLower) ||
            order.customerName.toLowerCase().includes(queryLower) ||
            order.contactNumber.toLowerCase().includes(queryLower) ||
            order.addressOrNotes.toLowerCase().includes(queryLower) ||
            order.tableNumber.toLowerCase().includes(queryLower) ||
            order.paymentReference.toLowerCase().includes(queryLower);
          if (!hit) return false;
        }
        return true;
      });

      const baseFiltered = searchFiltered.filter((order) => {
        if (!params.paymentStatus || params.paymentStatus === 'all') return true;
        return order.paymentStatus === params.paymentStatus;
      });

      const counts = {
        all: baseFiltered.length,
        active: baseFiltered.filter(
          (order) => order.status !== 'completed' && order.status !== 'cancelled',
        ).length,
        received: baseFiltered.filter((order) => order.status === 'received').length,
        preparing: baseFiltered.filter((order) => order.status === 'preparing').length,
        ready: baseFiltered.filter((order) => order.status === 'ready').length,
        completed: baseFiltered.filter((order) => order.status === 'completed').length,
        cancelled: baseFiltered.filter((order) => order.status === 'cancelled').length,
        pendingVerification: searchFiltered.filter(
          (order) => order.paymentStatus === 'pending_verification',
        ).length,
      };

      const statusFiltered = baseFiltered.filter((order) => {
        if (!params.status || params.status === 'all') return true;
        if (params.status === 'active') {
          return order.status !== 'completed' && order.status !== 'cancelled';
        }
        return order.status === params.status;
      });

      const asc = params.sort === 'asc';
      const sorted = [...statusFiltered].sort((a, b) => {
        const cmpTime = a.createdAtIso.localeCompare(b.createdAtIso);
        const cmp = cmpTime !== 0 ? cmpTime : a.id.localeCompare(b.id);
        return asc ? cmp : -cmp;
      });

      const cursor = params.cursor;
      const afterCursor = cursor
        ? sorted.filter((order) => {
            const cmpTime = order.createdAtIso.localeCompare(cursor.createdAt);
            const cmp = cmpTime !== 0 ? cmpTime : order.id.localeCompare(cursor.id);
            return asc ? cmp > 0 : cmp < 0;
          })
        : sorted;

      const hasMore = afterCursor.length > params.limit;
      const sliced = hasMore ? afterCursor.slice(0, params.limit) : afterCursor;
      const last = sliced[sliced.length - 1];
      return {
        orders: sliced,
        nextCursor: hasMore && last ? `${last.createdAtIso}|${last.id}` : null,
        ...(!params.cursor ? { counts } : {}),
      };
    },
    getAdminOrderById: async (_token, orderId) => state.orders.get(orderId)?.order ?? null,
    updateOrderStatus: async (_token, orderId, status, expectedVersion) => {
      const entry = state.orders.get(orderId);
      if (!entry) return { status: 'not_found' };
      if (expectedVersion !== undefined && entry.order.version !== expectedVersion) {
        return { status: 'conflict', latest: entry.order };
      }
      entry.order = {
        ...entry.order,
        status,
        updatedAt: '2026-11-22T05:00:00.000Z',
        version: (entry.order.version ?? 1) + 1,
      };
      return { status: 'ok', data: entry.order };
    },
    updateOrderPaymentStatus: async (_token, orderId, paymentStatus, expectedVersion) => {
      const entry = state.orders.get(orderId);
      if (!entry) return { status: 'not_found' };
      if (expectedVersion !== undefined && entry.order.version !== expectedVersion) {
        return { status: 'conflict', latest: entry.order };
      }
      entry.order = {
        ...entry.order,
        paymentStatus,
        updatedAt: '2026-11-22T05:10:00.000Z',
        version: (entry.order.version ?? 1) + 1,
      };
      return { status: 'ok', data: entry.order };
    },
    listAdminUsers: async () => [...state.team],
    createAdminUser: async (_token, input) => {
      const normalizedEmail = input.email.trim().toLowerCase();
      if (state.team.some((member) => member.email.toLowerCase() === normalizedEmail)) {
        return { status: 'email_exists' };
      }
      const seq = state.userSeq;
      state.userSeq += 1;
      const member: AdminTeamMember = {
        id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
        email: normalizedEmail,
        role: input.role,
        active: true,
        createdAt: '2026-11-22T06:00:00.000Z',
        updatedAt: '2026-11-22T06:00:00.000Z',
      };
      state.team.push(member);
      return { status: 'ok', member };
    },
    updateAdminUser: async (_token, userId, input) => {
      const idx = state.team.findIndex((member) => member.id === userId);
      if (idx === -1) return { status: 'not_found' };
      const existing = state.team[idx];
      if (!existing) return { status: 'not_found' };
      const nextRole = input.role ?? existing.role;
      const nextActive = input.active ?? existing.active;
      if (
        existing.role === 'owner' &&
        existing.active &&
        (nextRole !== 'owner' || !nextActive) &&
        !state.team.some(
          (entry) => entry.id !== existing.id && entry.role === 'owner' && entry.active,
        )
      ) {
        return { status: 'last_owner' };
      }
      const updated: AdminTeamMember = {
        ...existing,
        role: nextRole,
        active: nextActive,
        updatedAt: '2026-11-22T06:30:00.000Z',
      };
      state.team[idx] = updated;
      return { status: 'ok', member: updated };
    },
    ...overrides,
  };

  return { gateway, state };
}

const CSRF_HEADERS = {
  Origin: 'http://localhost:5173',
  'X-Requested-With': 'fetch',
  'Content-Type': 'application/json',
};

describe('Eight Burgers REST BFF', () => {
  it('serves healthz, readyz, and catalog endpoints', async () => {
    const { gateway } = createFakeGateway();
    const app = createApp({ config: TEST_CONFIG, gateway });

    const healthRes = await app.request('/healthz');
    expect(healthRes.status).toBe(200);

    const readyRes = await app.request('/readyz');
    expect(readyRes.status).toBe(200);

    const catalogRes = await app.request('/api/v1/catalog');
    expect(catalogRes.status).toBe(200);
    const catalogJson = (await catalogRes.json()) as { data: { menu: MenuItem[] } };
    expect(catalogJson.data.menu).toHaveLength(16);
    expect(catalogRes.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('returns 503 on /readyz when database is unreachable', async () => {
    const { gateway } = createFakeGateway({ checkDatabaseReady: async () => false });
    const app = createApp({ config: TEST_CONFIG, gateway });

    const res = await app.request('/readyz');
    expect(res.status).toBe(503);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
  });

  it('enforces CSRF, idempotency, receipt token privacy, and server-side checkout rules', async () => {
    const { gateway } = createFakeGateway();
    const app = createApp({ config: TEST_CONFIG, gateway });

    const orderPayload = {
      customerName: 'Marco',
      contactNumber: '09171234567',
      fulfillment: 'pickup',
      addressOrNotes: '',
      paymentMethod: 'gcash',
      items: [{ itemId: 'burger-deluxe', quantity: 2, selectedOptionIds: [] }],
    };

    // Reject missing CSRF header
    const noCsrfRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify(orderPayload),
    });
    expect(noCsrfRes.status).toBe(403);

    // Reject missing Idempotency-Key
    const noKeyRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify(orderPayload),
    });
    expect(noKeyRes.status).toBe(400);

    // Create order successfully
    const idempotencyKey = '11111111-2222-4333-8444-555555555555';
    const createRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(orderPayload),
    });
    expect(createRes.status).toBe(201);
    expect(createRes.headers.get('cache-control')).toBe('no-store');
    const createdBody = (await createRes.json()) as { data: OrderRecord; receiptToken: string };
    expect(createdBody.data.queueNumber).toBe('#8B-101');
    expect(createdBody.data.totalPhp).toBe(296);

    // Idempotent replay returns exact same order + receipt token without incrementing queue
    const replayRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(orderPayload),
    });
    expect(replayRes.status).toBe(201);
    const replayBody = (await replayRes.json()) as { data: OrderRecord; receiptToken: string };
    expect(replayBody.data.queueNumber).toBe('#8B-101');
    expect(replayBody.receiptToken).toBe(createdBody.receiptToken);

    // Same key with mutated payload -> 409 IDEMPOTENCY_CONFLICT
    const conflictRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ ...orderPayload, customerName: 'Different Name' }),
    });
    expect(conflictRes.status).toBe(409);

    // Receipt endpoint rejects missing token (404) and allows valid receipt token (200)
    const unauthReceiptRes = await app.request(`/api/v1/orders/${createdBody.data.id}`);
    expect(unauthReceiptRes.status).toBe(404);

    const validReceiptRes = await app.request(`/api/v1/orders/${createdBody.data.id}`, {
      headers: { 'X-Order-Receipt-Token': createdBody.receiptToken },
    });
    expect(validReceiptRes.status).toBe(200);
    expect(validReceiptRes.headers.get('cache-control')).toBe('no-store');

    // Delivery order passing legacy deliveryZoneId is rejected with 400 VALIDATION_ERROR
    const legacyZoneRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': '11111111-3333-4333-8444-555555555555' },
      body: JSON.stringify({
        customerName: 'Marco',
        contactNumber: '09171234567',
        fulfillment: 'delivery',
        deliveryZoneId: 'chino-roces-san-antonio',
        addressOrNotes: 'Ayala Avenue, Makati',
        paymentMethod: 'cash',
        items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
      }),
    });
    expect(legacyZoneRes.status).toBe(400);
    const missingPinBody = (await legacyZoneRes.json()) as {
      code: string;
      fieldErrors?: Record<string, string[]>;
    };
    expect(missingPinBody.code).toBe('VALIDATION_ERROR');

    // Delivery order with Ayala Triangle pin computes exact baseFee + perKmRate fee (₱35 + 1.7 * ₱10 = ₱52)
    const pinOnlyDeliveryRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': '11111111-4444-4333-8444-555555555555' },
      body: JSON.stringify({
        customerName: 'Marco',
        contactNumber: '09171234567',
        fulfillment: 'delivery',
        deliveryPin: { lat: 14.5572, lng: 121.0236 },
        addressOrNotes: 'Ayala Triangle Gardens, Makati',
        paymentMethod: 'cash',
        items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
      }),
    });
    expect(pinOnlyDeliveryRes.status).toBe(201);
    const deliveryOrderBody = (await pinOnlyDeliveryRes.json()) as {
      data: OrderRecord & Record<string, unknown>;
    };
    expect(deliveryOrderBody.data.deliveryDistanceKm).toBe(1.7);
    expect(deliveryOrderBody.data.deliveryFeePhp).toBe(52);
    expect(deliveryOrderBody.data.totalPhp).toBe(200);
    expect(deliveryOrderBody.data.deliveryEtaMinutes).toBe('20–30 min');
    expect('deliveryZoneId' in deliveryOrderBody.data).toBe(false);
    expect('deliveryZoneName' in deliveryOrderBody.data).toBe(false);

    // Out-of-range delivery pin returns 422
    const outOfRangeRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': '22222222-2222-4333-8444-555555555555' },
      body: JSON.stringify({
        customerName: 'Marco',
        contactNumber: '09171234567',
        fulfillment: 'delivery',
        deliveryPin: { lat: 14.1153, lng: 120.9621 },
        addressOrNotes: 'Tagaytay Rotonda',
        paymentMethod: 'cash',
        items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
      }),
    });
    expect(outOfRangeRes.status).toBe(422);
    expect(((await outOfRangeRes.json()) as { code: string }).code).toBe('OUT_OF_DELIVERY_RANGE');

    // Stale expectedTotalPhp returns 409 PRICE_CHANGED
    const priceChangedRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': '33333333-2222-4333-8444-555555555555' },
      body: JSON.stringify({ ...orderPayload, expectedTotalPhp: 100 }),
    });
    expect(priceChangedRes.status).toBe(409);
  });

  it('enforces HttpOnly admin cookies, silent refresh, optimistic concurrency, and logout', async () => {
    const { gateway } = createFakeGateway();
    const app = createApp({ config: TEST_CONFIG, gateway });

    // Unauthenticated admin request returns 401
    const unauthRes = await app.request('/api/v1/admin/orders');
    expect(unauthRes.status).toBe(401);

    // Non-admin returns 403
    const forbiddenLogin = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ email: 'nonadmin@eightburgers.local', password: 'valid-pass' }),
    });
    expect(forbiddenLogin.status).toBe(403);

    // Valid owner login sets HttpOnly SameSite=Lax cookies
    const loginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ email: ADMIN_USER.email, password: 'EightBurgersDev123!' }),
    });
    expect(loginRes.status).toBe(200);
    const setCookies = loginRes.headers.getSetCookie();
    expect(
      setCookies.some(
        (cookie) =>
          cookie.includes('mk_access_token=valid-access-token') &&
          cookie.includes('HttpOnly') &&
          cookie.includes('SameSite=Lax'),
      ),
    ).toBe(true);

    // Expired access cookie + valid refresh cookie silently refreshes on admin route
    const refreshedAdminRes = await app.request('/api/v1/admin/orders', {
      headers: {
        Cookie: 'mk_access_token=expired-token; mk_refresh_token=valid-refresh-token',
      },
    });
    expect(refreshedAdminRes.status).toBe(200);
    expect(
      refreshedAdminRes.headers
        .getSetCookie()
        .some((cookie) => cookie.includes('mk_refresh_token=rotated-refresh-token')),
    ).toBe(true);

    // Optimistic concurrency conflict (409) when expectedVersion is stale
    const conflictPatch = await app.request('/api/v1/admin/menu-items/burger-deluxe/availability', {
      method: 'PATCH',
      headers: {
        ...CSRF_HEADERS,
        Cookie: 'mk_access_token=valid-access-token',
      },
      body: JSON.stringify({
        available: false,
        expectedVersion: 99,
      }),
    });
    expect(conflictPatch.status).toBe(409);

    // Delete menu item returns 204 No Content
    const deleteRes = await app.request('/api/v1/admin/menu-items/burger-deluxe', {
      method: 'DELETE',
      headers: {
        Origin: 'http://localhost:5173',
        'X-Requested-With': 'fetch',
        Cookie: 'mk_access_token=valid-access-token',
      },
    });
    expect(deleteRes.status).toBe(204);

    // Logout clears cookies and returns 204
    const logoutRes = await app.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'X-Requested-With': 'fetch',
        Cookie: 'mk_access_token=valid-access-token',
      },
    });
    expect(logoutRes.status).toBe(204);
  });

  it('enforces rate limiting with Retry-After and redacts unexpected errors', async () => {
    const { gateway } = createFakeGateway({
      getCatalog: async () => {
        throw new Error('pg internal relation secret_table failed');
      },
    });
    const loginRateLimiter = new SlidingWindowRateLimiter(1, 60_000);
    const app = createApp({ config: TEST_CONFIG, gateway, loginRateLimiter });

    const firstLogin = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ email: 'owner@eightburgers.local', password: 'wrong' }),
    });
    expect(firstLogin.status).toBe(401);

    const secondLogin = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ email: 'owner@eightburgers.local', password: 'wrong' }),
    });
    expect(secondLogin.status).toBe(429);
    expect(Number(secondLogin.headers.get('retry-after'))).toBeGreaterThan(0);

    const errorRes = await app.request('/api/v1/catalog');
    expect(errorRes.status).toBe(500);
    const bodyText = await errorRes.text();
    expect(bodyText).not.toContain('secret_table');
  });

  it('updates admin order status with integer expectedVersion optimistic locking', async () => {
    const { gateway } = createFakeGateway();
    const app = createApp({ config: TEST_CONFIG, gateway });

    const createRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        'Idempotency-Key': '44444444-2222-4333-8444-555555555555',
      },
      body: JSON.stringify({
        customerName: 'Marco',
        contactNumber: '09171234567',
        fulfillment: 'pickup',
        addressOrNotes: '',
        paymentMethod: 'cash',
        items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
      }),
    });
    expect(createRes.status).toBe(201);
    const createdBody = (await createRes.json()) as { data: OrderRecord };
    expect(createdBody.data.version).toBe(1);

    const patchRes = await app.request(`/api/v1/admin/orders/${createdBody.data.id}/status`, {
      method: 'PATCH',
      headers: {
        ...CSRF_HEADERS,
        Cookie: 'mk_access_token=valid-access-token',
      },
      body: JSON.stringify({
        status: 'preparing',
        expectedVersion: createdBody.data.version,
      }),
    });
    expect(patchRes.status).toBe(200);
    const patchBody = (await patchRes.json()) as { data: OrderRecord };
    expect(patchBody.data.status).toBe('preparing');
    expect(patchBody.data.version).toBe(2);

    // Reusing stale version 1 triggers 409 Conflict
    const staleRes = await app.request(`/api/v1/admin/orders/${createdBody.data.id}/status`, {
      method: 'PATCH',
      headers: {
        ...CSRF_HEADERS,
        Cookie: 'mk_access_token=valid-access-token',
      },
      body: JSON.stringify({
        status: 'ready',
        expectedVersion: 1,
      }),
    });
    expect(staleRes.status).toBe(409);

    // Invalid version returns 400 Validation Failed
    const invalidRes = await app.request(`/api/v1/admin/orders/${createdBody.data.id}/status`, {
      method: 'PATCH',
      headers: {
        ...CSRF_HEADERS,
        Cookie: 'mk_access_token=valid-access-token',
      },
      body: JSON.stringify({
        status: 'ready',
        expectedVersion: 0,
      }),
    });
    expect(invalidRes.status).toBe(400);
  });

  it('supports composite cursor tie-breaking, server-side filters, counts, and strict query validation on admin orders', async () => {
    const { gateway, state } = createFakeGateway();
    const sharedTs = '2026-11-22T02:00:00.000Z';
    const seedOrder = (
      id: string,
      queueNumber: string,
      customerName: string,
      status: OrderRecord['status'],
      createdAtIso: string,
    ): OrderRecord => ({
      id,
      queueNumber,
      customerName,
      contactNumber: '09171234567',
      fulfillment: 'pickup',
      tableNumber: '',
      addressOrNotes: '',
      paymentMethod: 'cash',
      paymentStatus: 'unpaid',
      paymentReference: '',
      lines: [
        {
          lineId: 'burger-deluxe',
          itemId: 'burger-deluxe',
          name: 'Burger Deluxe',
          unitPricePhp: 148,
          selectedOptions: [],
          addonNames: [],
          itemNote: '',
          addonsPricePhp: 0,
          quantity: 1,
          lineTotalPhp: 148,
        },
      ],
      subtotalPhp: 148,
      deliveryFeePhp: 0,
      totalPhp: 148,
      status,
      createdAtIso,
      updatedAt: createdAtIso,
      version: 1,
    });

    const orders: OrderRecord[] = [
      seedOrder('00000000-0000-4000-8000-000000000003', '#8B-103', 'Carla', 'received', sharedTs),
      seedOrder('00000000-0000-4000-8000-000000000002', '#8B-102', 'Marco', 'preparing', sharedTs),
      seedOrder(
        '00000000-0000-4000-8000-000000000001',
        '#8B-101',
        'Alex',
        'completed',
        '2026-11-22T01:00:00.000Z',
      ),
    ];
    for (const order of orders) {
      state.orders.set(order.id, {
        order,
        idempotencyKey: order.id,
        payloadHash: order.id,
        receiptTokenHash: order.id,
      });
    }

    const app = createApp({ config: TEST_CONFIG, gateway });
    const authHeaders = { Cookie: 'mk_access_token=valid-access-token' };

    // Page 1 (limit=1, status=active) returns #8B-103 with composite cursor and full stage counts
    const page1Res = await app.request('/api/v1/admin/orders?status=active&limit=1', {
      headers: authHeaders,
    });
    expect(page1Res.status).toBe(200);
    const page1 = (await page1Res.json()) as {
      data: OrderRecord[];
      nextCursor: string | null;
      counts?: Record<string, number>;
    };
    expect(page1.data.map((o) => o.queueNumber)).toEqual(['#8B-103']);
    expect(page1.nextCursor).toBe(`${sharedTs}|00000000-0000-4000-8000-000000000003`);
    expect(page1.counts).toEqual({
      all: 3,
      active: 2,
      received: 1,
      preparing: 1,
      ready: 0,
      completed: 1,
      cancelled: 0,
      pendingVerification: 0,
    });

    // Page 2 with composite cursor does NOT drop #8B-102 even though createdAtIso is identical
    const page2Res = await app.request(
      `/api/v1/admin/orders?status=active&limit=1&cursor=${encodeURIComponent(page1.nextCursor ?? '')}`,
      { headers: authHeaders },
    );
    expect(page2Res.status).toBe(200);
    const page2 = (await page2Res.json()) as { data: OrderRecord[]; nextCursor: string | null };
    expect(page2.data.map((o) => o.queueNumber)).toEqual(['#8B-102']);
    expect(page2.nextCursor).toBeNull();

    // FIFO sort (asc) returns older #8B-102 before #8B-103
    const fifoRes = await app.request('/api/v1/admin/orders?status=active&sort=asc&limit=10', {
      headers: authHeaders,
    });
    expect(fifoRes.status).toBe(200);
    const fifoBody = (await fifoRes.json()) as { data: OrderRecord[] };
    expect(fifoBody.data.map((o) => o.queueNumber)).toEqual(['#8B-102', '#8B-103']);

    // Invalid cursor and invalid limit return 400 INVALID_QUERY
    const badCursorRes = await app.request('/api/v1/admin/orders?cursor=not-a-valid-cursor', {
      headers: authHeaders,
    });
    expect(badCursorRes.status).toBe(400);

    const badLimitRes = await app.request('/api/v1/admin/orders?limit=999', {
      headers: authHeaders,
    });
    expect(badLimitRes.status).toBe(400);
  });

  it('deduplicates concurrent refresh-token rotations and validates distance-formula delivery pricing mutations', async () => {
    let refreshCalls = 0;
    const { gateway } = createFakeGateway({
      refreshAdminSession: async (refreshToken) => {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 25));
        if (refreshToken !== 'valid-refresh-token') return null;
        return {
          user: ADMIN_USER,
          tokens: {
            accessToken: 'valid-access-token',
            refreshToken: 'rotated-refresh-token',
            expiresInSeconds: 3600,
          },
        };
      },
    });
    const app = createApp({ config: TEST_CONFIG, gateway });
    const expiredCookies = {
      Cookie: 'mk_access_token=expired-token; mk_refresh_token=valid-refresh-token',
    };

    const [resA, resB] = await Promise.all([
      app.request('/api/v1/auth/session', { headers: expiredCookies }),
      app.request('/api/v1/admin/orders', { headers: expiredCookies }),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(refreshCalls).toBe(1);

    const ownerHeaders = {
      ...CSRF_HEADERS,
      Cookie: 'mk_access_token=valid-access-token',
    };

    // Sub-0.1km max distance, empty body, and negative rates are rejected with 400 VALIDATION_ERROR
    for (const invalidBody of [
      {},
      { maxDistanceKm: 0.04 },
      { baseFeePhp: -1 },
      { perKmRatePhp: -5 },
    ]) {
      const invalidRes = await app.request('/api/v1/admin/delivery-pricing', {
        method: 'PATCH',
        headers: ownerHeaders,
        body: JSON.stringify(invalidBody),
      });
      expect(invalidRes.status).toBe(400);
    }

    // Legacy delivery-zones routes are removed (404)
    const removedZonesRes = await app.request('/api/v1/admin/delivery-zones', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ name: 'Legacy' }),
    });
    expect(removedZonesRes.status).toBe(404);

    // Owner updates distance formula pricing and pauses delivery (and disables threshold via null)
    const patchRes = await app.request('/api/v1/admin/delivery-pricing', {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({
        deliveryEnabled: false,
        baseFeePhp: 45,
        perKmRatePhp: 12,
        maxDistanceKm: 18,
        freeDeliveryMinSubtotalPhp: null,
        expectedVersion: 1,
      }),
    });
    expect(patchRes.status).toBe(200);
    const patchedBody = (await patchRes.json()) as { data: DeliveryPricingConfig };
    expect(patchedBody.data.deliveryEnabled).toBe(false);
    expect(patchedBody.data.baseFeePhp).toBe(45);
    expect(patchedBody.data.perKmRatePhp).toBe(12);
    expect(patchedBody.data.maxDistanceKm).toBe(18);
    expect(patchedBody.data.freeDeliveryMinSubtotalPhp).toBeNull();
    expect(patchedBody.data.version).toBe(2);

    // Paused delivery rejects checkout with 422 DELIVERY_UNAVAILABLE
    const pausedOrderRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        'Idempotency-Key': 'paused-delivery-check-123456',
      },
      body: JSON.stringify({
        customerName: 'Marco',
        contactNumber: '09171234567',
        fulfillment: 'delivery',
        deliveryPin: { lat: 14.5572, lng: 121.0236 },
        addressOrNotes: 'Ayala Triangle',
        paymentMethod: 'cash',
        items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
      }),
    });
    expect(pausedOrderRes.status).toBe(422);
    expect(((await pausedOrderRes.json()) as { code: string }).code).toBe('DELIVERY_UNAVAILABLE');

    // Stale expectedVersion returns 409 CONFLICT
    const staleRes = await app.request('/api/v1/admin/delivery-pricing', {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({ baseFeePhp: 50, expectedVersion: 1 }),
    });
    expect(staleRes.status).toBe(409);

    // Reset is blocked by default when ENABLE_DEMO_RESET=false (403 DEMO_RESET_DISABLED)
    const blockedResetRes = await app.request('/api/v1/admin/delivery-pricing/reset', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'X-Requested-With': 'fetch',
        Cookie: 'mk_access_token=valid-access-token',
      },
    });
    expect(blockedResetRes.status).toBe(403);
    expect(((await blockedResetRes.json()) as { code: string }).code).toBe('DEMO_RESET_DISABLED');

    // Reset restores defaults cleanly when ENABLE_DEMO_RESET=true
    const resetEnabledApp = createApp({
      config: { ...TEST_CONFIG, enableDemoReset: true },
      gateway,
    });
    const resetRes = await resetEnabledApp.request('/api/v1/admin/delivery-pricing/reset', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'X-Requested-With': 'fetch',
        Cookie: 'mk_access_token=valid-access-token',
      },
    });
    expect(resetRes.status).toBe(200);
    const resetBody = (await resetRes.json()) as { data: DeliveryPricingConfig };
    expect(resetBody.data.deliveryEnabled).toBe(true);
    expect(resetBody.data.baseFeePhp).toBe(35);
    expect(resetBody.data.perKmRatePhp).toBe(10);
    expect(resetBody.data.maxDistanceKm).toBe(25);
    expect(resetBody.data.freeDeliveryMinSubtotalPhp).toBe(500);
  });

  it('enforces paused delivery across checkout, pickup continuity, queue preservation, rate persistence, and resume', async () => {
    const { gateway, state } = createFakeGateway();
    const app = createApp({ config: TEST_CONFIG, gateway });
    const ownerCookie = { Cookie: 'mk_access_token=valid-access-token' };
    const ownerMutationHeaders = { ...CSRF_HEADERS, ...ownerCookie };

    // 1. Set custom formula rates
    const customRes = await app.request('/api/v1/admin/delivery-pricing', {
      method: 'PATCH',
      headers: ownerMutationHeaders,
      body: JSON.stringify({
        baseFeePhp: 45,
        perKmRatePhp: 12,
        maxDistanceKm: 18,
        freeDeliveryMinSubtotalPhp: 600,
        expectedVersion: 1,
      }),
    });
    expect(customRes.status).toBe(200);
    expect(((await customRes.json()) as { data: DeliveryPricingConfig }).data.version).toBe(2);

    // 2. Partial pause preserves custom rates
    const pauseRes = await app.request('/api/v1/admin/delivery-pricing', {
      method: 'PATCH',
      headers: ownerMutationHeaders,
      body: JSON.stringify({
        deliveryEnabled: false,
        expectedVersion: 2,
      }),
    });
    expect(pauseRes.status).toBe(200);
    const pausedPricing = ((await pauseRes.json()) as { data: DeliveryPricingConfig }).data;
    expect(pausedPricing).toMatchObject({
      deliveryEnabled: false,
      baseFeePhp: 45,
      perKmRatePhp: 12,
      maxDistanceKm: 18,
      freeDeliveryMinSubtotalPhp: 600,
      version: 3,
    });

    // 3. Public catalog and delivery-pricing reflect paused state
    const publicPricingRes = await app.request('/api/v1/delivery-pricing');
    expect(publicPricingRes.status).toBe(200);
    expect(
      ((await publicPricingRes.json()) as { data: DeliveryPricingConfig }).data.deliveryEnabled,
    ).toBe(false);

    const publicCatalogRes = await app.request('/api/v1/catalog');
    expect(publicCatalogRes.status).toBe(200);
    expect(
      ((await publicCatalogRes.json()) as { data: { deliveryPricing: DeliveryPricingConfig } }).data
        .deliveryPricing.deliveryEnabled,
    ).toBe(false);

    // 4. Delivery order above free threshold is still rejected (422) without burning queue seq
    const blockedDeliveryRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        'Idempotency-Key': 'paused-retry-order-key-123456',
      },
      body: JSON.stringify({
        customerName: 'Marco',
        contactNumber: '09171234567',
        fulfillment: 'delivery',
        deliveryPin: { lat: 14.5572, lng: 121.0236 },
        addressOrNotes: 'Ayala Triangle Gardens, Makati',
        paymentMethod: 'gcash',
        items: [{ itemId: 'overload-burger', quantity: 3, selectedOptionIds: [] }],
      }),
    });
    expect(blockedDeliveryRes.status).toBe(422);
    expect(blockedDeliveryRes.headers.get('content-type')).toContain('application/problem+json');
    expect(((await blockedDeliveryRes.json()) as { code: string }).code).toBe(
      'DELIVERY_UNAVAILABLE',
    );
    expect(state.seq).toBe(101);
    expect(state.orders.size).toBe(0);

    // 5. Kiosk pickup still succeeds while delivery is paused and mints #8B-101
    const pickupRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        'Idempotency-Key': 'pickup-during-pause-123456',
      },
      body: JSON.stringify({
        customerName: 'Ana',
        contactNumber: '',
        fulfillment: 'pickup',
        addressOrNotes: '',
        paymentMethod: 'cash',
        items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
      }),
    });
    expect(pickupRes.status).toBe(201);
    expect(((await pickupRes.json()) as { data: OrderRecord }).data.queueNumber).toBe('#8B-101');

    // 6. Non-owner cannot resume delivery (403)
    const cashierResumeRes = await app.request('/api/v1/admin/delivery-pricing', {
      method: 'PATCH',
      headers: {
        ...CSRF_HEADERS,
        Cookie: 'mk_access_token=cashier-access-token',
      },
      body: JSON.stringify({ deliveryEnabled: true }),
    });
    expect(cashierResumeRes.status).toBe(403);

    // 7. Owner resumes delivery while custom rates remain intact
    const resumeRes = await app.request('/api/v1/admin/delivery-pricing', {
      method: 'PATCH',
      headers: ownerMutationHeaders,
      body: JSON.stringify({
        deliveryEnabled: true,
        expectedVersion: 3,
      }),
    });
    expect(resumeRes.status).toBe(200);
    expect(((await resumeRes.json()) as { data: DeliveryPricingConfig }).data).toMatchObject({
      deliveryEnabled: true,
      baseFeePhp: 45,
      perKmRatePhp: 12,
      maxDistanceKm: 18,
      freeDeliveryMinSubtotalPhp: 600,
      version: 4,
    });

    // 8. Retry delivery using the same key (rejected 422 wasn't stored) succeeds with custom rates
    // Ayala Triangle = 1.7 km -> ₱45 + round(1.7 * 12 = 20.4 -> 20) = ₱65; ₱148 + ₱65 = ₱213
    const retryDeliveryRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        'Idempotency-Key': 'paused-retry-order-key-123456',
      },
      body: JSON.stringify({
        customerName: 'Marco',
        contactNumber: '09171234567',
        fulfillment: 'delivery',
        deliveryPin: { lat: 14.5572, lng: 121.0236 },
        addressOrNotes: 'Ayala Triangle Gardens, Makati',
        paymentMethod: 'gcash',
        items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
      }),
    });
    expect(retryDeliveryRes.status).toBe(201);
    const retryBody = (await retryDeliveryRes.json()) as { data: OrderRecord };
    expect(retryBody.data.queueNumber).toBe('#8B-102');
    expect(retryBody.data.deliveryFeePhp).toBe(65);
    expect(retryBody.data.totalPhp).toBe(213);
  });

  it('uploads, optimizes to WebP, and cleans up unused menu images via admin endpoints', async () => {
    const { gateway, state } = createFakeGateway();
    const app = createApp({
      config: TEST_CONFIG,
      gateway,
      optimizeMenuImage: async (buf) => ({
        buffer: buf,
        width: 1200,
        height: 800,
        sizeBytes: 32_100,
        contentType: 'image/webp',
      }),
    });

    const formData = new FormData();
    formData.append(
      'file',
      new File([new Uint8Array([1, 2, 3, 4])], 'burger.png', { type: 'image/png' }),
    );

    // Unauthenticated upload rejected with 401
    const unauthUpload = await app.request('/api/v1/admin/menu-images', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'X-Requested-With': 'fetch',
      },
      body: formData,
    });
    expect(unauthUpload.status).toBe(401);

    // Authenticated upload succeeds and returns optimized WebP metadata
    const uploadRes = await app.request('/api/v1/admin/menu-images', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'X-Requested-With': 'fetch',
        Cookie: 'mk_access_token=valid-access-token',
      },
      body: formData,
    });
    expect(uploadRes.status).toBe(201);
    const uploadBody = (await uploadRes.json()) as {
      data: { imageUrl: string; path: string; contentType: string; width: number; height: number };
    };
    expect(uploadBody.data.contentType).toBe('image/webp');
    expect(uploadBody.data.imageUrl).toContain('/storage/v1/object/public/menu-images/items/');
    expect(state.uploadedImages.has(uploadBody.data.imageUrl)).toBe(true);

    // Deleting an unused uploaded image removes it cleanly
    const deleteRes = await app.request('/api/v1/admin/menu-images', {
      method: 'DELETE',
      headers: {
        ...CSRF_HEADERS,
        Cookie: 'mk_access_token=valid-access-token',
      },
      body: JSON.stringify({ imageUrl: uploadBody.data.imageUrl }),
    });
    expect(deleteRes.status).toBe(204);
    expect(state.uploadedImages.has(uploadBody.data.imageUrl)).toBe(false);
  });

  it('supports public non-PII queue tracking and two-tier order cancellation while status is received', async () => {
    const { gateway } = createFakeGateway();
    const app = createApp({ config: TEST_CONFIG, gateway });

    // Place a delivery order (#8B-101) and a kiosk pickup order (#8B-102)
    const deliveryOrderRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        'Idempotency-Key': 'cancel-test-delivery-order-101',
      },
      body: JSON.stringify({
        customerName: 'Marco Santos',
        contactNumber: '09171234567',
        fulfillment: 'delivery',
        deliveryPin: { lat: 14.5608, lng: 121.0124 },
        addressOrNotes: 'Unit 402 Chino Roces',
        paymentMethod: 'gcash',
        items: [{ itemId: 'burger-deluxe', quantity: 2, selectedOptionIds: [] }],
      }),
    });
    expect(deliveryOrderRes.status).toBe(201);
    const deliveryCreated = (await deliveryOrderRes.json()) as {
      data: OrderRecord;
      receiptToken: string;
    };

    const pickupOrderRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        'Idempotency-Key': 'cancel-test-pickup-order-102',
      },
      body: JSON.stringify({
        customerName: 'Ana Reyes',
        contactNumber: '',
        fulfillment: 'pickup',
        addressOrNotes: '',
        paymentMethod: 'cash',
        items: [{ itemId: 'chicano-burger', quantity: 1, selectedOptionIds: [] }],
      }),
    });
    expect(pickupOrderRes.status).toBe(201);
    const pickupCreated = (await pickupOrderRes.json()) as {
      data: OrderRecord;
      receiptToken: string;
    };

    // Public tracker lookup works by numeric or prefixed queue number and omits PII
    const trackRes = await app.request('/api/v1/orders/track/101');
    expect(trackRes.status).toBe(200);
    const trackBody = (await trackRes.json()) as { data: Record<string, unknown> };
    expect(trackBody.data.queueNumber).toBe('#8B-101');
    expect(trackBody.data.status).toBe('received');
    expect(trackBody.data.customerName).toBeUndefined();
    expect(trackBody.data.contactNumber).toBeUndefined();
    expect(trackBody.data.addressOrNotes).toBeUndefined();

    // Tier 1: Cancel order #8B-101 with valid X-Order-Receipt-Token
    const badTokenCancel = await app.request(`/api/v1/orders/${deliveryCreated.data.id}/cancel`, {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        'X-Order-Receipt-Token': 'wrong-token',
      },
    });
    expect(badTokenCancel.status).toBe(404);

    const tier1Cancel = await app.request(`/api/v1/orders/${deliveryCreated.data.id}/cancel`, {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        'X-Order-Receipt-Token': deliveryCreated.receiptToken,
      },
    });
    expect(tier1Cancel.status).toBe(200);
    const tier1Body = (await tier1Cancel.json()) as { data: OrderRecord };
    expect(tier1Body.data.status).toBe('cancelled');

    // Tier 2: Cross-device queue cancel rejects wrong customer name with 403 and succeeds with matching name
    const wrongNameCancel = await app.request('/api/v1/orders/track/8B-102/cancel', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ customerName: 'Wrong Person' }),
    });
    expect(wrongNameCancel.status).toBe(403);

    const tier2Cancel = await app.request('/api/v1/orders/track/102/cancel', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ customerName: '  ana   reyes ' }),
    });
    expect(tier2Cancel.status).toBe(200);
    const tier2Body = (await tier2Cancel.json()) as { data: PublicOrderTracker };
    expect(tier2Body.data.status).toBe('cancelled');

    // Once an order is grilling, customer cancellation returns 409 ORDER_NOT_CANCELLABLE
    const grillingOrderRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        'Idempotency-Key': 'cancel-test-grilling-order-103',
      },
      body: JSON.stringify({
        customerName: 'Chef Locked',
        contactNumber: '09181112222',
        fulfillment: 'delivery',
        deliveryPin: { lat: 14.5608, lng: 121.0124 },
        addressOrNotes: 'Makati',
        paymentMethod: 'cash',
        items: [{ itemId: 'burger-deluxe', quantity: 2, selectedOptionIds: [] }],
      }),
    });
    const grillingCreated = (await grillingOrderRes.json()) as {
      data: OrderRecord;
      receiptToken: string;
    };

    await app.request(`/api/v1/admin/orders/${grillingCreated.data.id}/status`, {
      method: 'PATCH',
      headers: {
        ...CSRF_HEADERS,
        Cookie: 'mk_access_token=valid-access-token',
      },
      body: JSON.stringify({ status: 'preparing', expectedVersion: 1 }),
    });

    const lateTier1Cancel = await app.request(`/api/v1/orders/${grillingCreated.data.id}/cancel`, {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        'X-Order-Receipt-Token': grillingCreated.receiptToken,
      },
    });
    expect(lateTier1Cancel.status).toBe(409);

    const lateTier2Cancel = await app.request('/api/v1/orders/track/103/cancel', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ contactNumber: '+63 918 111 2222' }),
    });
    expect(lateTier2Cancel.status).toBe(409);

    // Admin orders filter & counts exclude cancelled from active and list cancelled orders
    const adminCancelledRes = await app.request('/api/v1/admin/orders?status=cancelled', {
      headers: { Cookie: 'mk_access_token=valid-access-token' },
    });
    expect(adminCancelledRes.status).toBe(200);
    const adminCancelledBody = (await adminCancelledRes.json()) as {
      data: OrderRecord[];
      counts: { all: number; active: number; cancelled: number; preparing: number };
    };
    expect(adminCancelledBody.data).toHaveLength(2);
    expect(adminCancelledBody.counts.cancelled).toBe(2);
    expect(adminCancelledBody.counts.active).toBe(1);
    expect(adminCancelledBody.counts.all).toBe(3);

    expect(pickupCreated.data.queueNumber).toBe('#8B-102');
  });

  it('enforces role-based permissions for owner, cashier, and staff accounts', async () => {
    const { gateway } = createFakeGateway();
    const app = createApp({ config: TEST_CONFIG, gateway });

    // Seed one order so cashier and staff can update statuses including cancelled
    const createOrderRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        'Idempotency-Key': 'rbac-test-order-101',
      },
      body: JSON.stringify({
        customerName: 'RBAC Customer',
        contactNumber: '09175551234',
        fulfillment: 'pickup',
        addressOrNotes: '',
        paymentMethod: 'cash',
        items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
      }),
    });
    expect(createOrderRes.status).toBe(201);
    const createdOrder = ((await createOrderRes.json()) as { data: OrderRecord }).data;

    for (const account of [
      { email: CASHIER_USER.email, role: 'cashier', token: 'cashier-access-token' },
      { email: STAFF_USER.email, role: 'staff', token: 'staff-access-token' },
    ]) {
      const loginRes = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: CSRF_HEADERS,
        body: JSON.stringify({ email: account.email, password: 'EightBurgersDev123!' }),
      });
      expect(loginRes.status).toBe(200);
      const loginBody = (await loginRes.json()) as { data: { user: AdminUser } };
      expect(loginBody.data.user.role).toBe(account.role);

      const authCookie = { Cookie: `mk_access_token=${account.token}` };
      const authMutationHeaders = { ...CSRF_HEADERS, ...authCookie };

      // Allowed: view orders, update order status (including cancelled), toggle menu availability
      const ordersRes = await app.request('/api/v1/admin/orders', { headers: authCookie });
      expect(ordersRes.status).toBe(200);

      const statusUpdateRes = await app.request(`/api/v1/admin/orders/${createdOrder.id}/status`, {
        method: 'PATCH',
        headers: authMutationHeaders,
        body: JSON.stringify({ status: account.role === 'cashier' ? 'preparing' : 'cancelled' }),
      });
      expect(statusUpdateRes.status).toBe(200);

      const toggleRes = await app.request('/api/v1/admin/menu-items/burger-deluxe/availability', {
        method: 'PATCH',
        headers: authMutationHeaders,
        body: JSON.stringify({ available: account.role !== 'cashier' }),
      });
      expect(toggleRes.status).toBe(200);

      // Forbidden (403 INSUFFICIENT_ROLE): menu CRUD, reset, image upload/delete, delivery settings
      const createMenuRes = await app.request('/api/v1/admin/menu-items', {
        method: 'POST',
        headers: authMutationHeaders,
        body: JSON.stringify({
          name: 'Unauthorized Burger',
          category: 'classic-burgers',
          pricePhp: 199,
          specLabel: '100g Pure Beef',
          description: 'Blocked for non-owners',
          imageUrl: '',
          available: true,
          featured: false,
          optionGroupIds: ['add-ons'],
        }),
      });
      expect(createMenuRes.status).toBe(403);
      expect(((await createMenuRes.json()) as { code: string }).code).toBe('INSUFFICIENT_ROLE');

      const updateMenuRes = await app.request('/api/v1/admin/menu-items/burger-deluxe', {
        method: 'PUT',
        headers: authMutationHeaders,
        body: JSON.stringify({
          name: 'Burger Deluxe',
          category: 'classic-burgers',
          pricePhp: 999,
          specLabel: '100g Pure Beef',
          description: 'Attempted price edit',
          imageUrl: '',
          available: true,
          featured: true,
          optionGroupIds: ['add-ons'],
        }),
      });
      expect(updateMenuRes.status).toBe(403);

      const deleteMenuRes = await app.request('/api/v1/admin/menu-items/burger-deluxe', {
        method: 'DELETE',
        headers: { Origin: 'http://localhost:5173', 'X-Requested-With': 'fetch', ...authCookie },
      });
      expect(deleteMenuRes.status).toBe(403);

      const resetMenuRes = await app.request('/api/v1/admin/menu-items/reset', {
        method: 'POST',
        headers: { Origin: 'http://localhost:5173', 'X-Requested-With': 'fetch', ...authCookie },
      });
      expect(resetMenuRes.status).toBe(403);

      const formData = new FormData();
      formData.append(
        'file',
        new File([new Uint8Array([1, 2, 3])], 'burger.png', { type: 'image/png' }),
      );
      const uploadImageRes = await app.request('/api/v1/admin/menu-images', {
        method: 'POST',
        headers: { Origin: 'http://localhost:5173', 'X-Requested-With': 'fetch', ...authCookie },
        body: formData,
      });
      expect(uploadImageRes.status).toBe(403);

      const deleteImageRes = await app.request('/api/v1/admin/menu-images', {
        method: 'DELETE',
        headers: authMutationHeaders,
        body: JSON.stringify({ imageUrl: '/storage/v1/object/public/menu-images/items/test.webp' }),
      });
      expect(deleteImageRes.status).toBe(403);

      const deliveryPatchRes = await app.request('/api/v1/admin/delivery-pricing', {
        method: 'PATCH',
        headers: authMutationHeaders,
        body: JSON.stringify({ baseFeePhp: 60, freeDeliveryMinSubtotalPhp: 600 }),
      });
      expect(deliveryPatchRes.status).toBe(403);

      const deliveryResetRes = await app.request('/api/v1/admin/delivery-pricing/reset', {
        method: 'POST',
        headers: { Origin: 'http://localhost:5173', 'X-Requested-With': 'fetch', ...authCookie },
      });
      expect(deliveryResetRes.status).toBe(403);

      const teamListRes = await app.request('/api/v1/admin/users', { headers: authCookie });
      expect(teamListRes.status).toBe(403);
      expect(((await teamListRes.json()) as { code: string }).code).toBe('INSUFFICIENT_ROLE');

      const teamCreateRes = await app.request('/api/v1/admin/users', {
        method: 'POST',
        headers: authMutationHeaders,
        body: JSON.stringify({
          email: 'unauthorized@eightburgers.local',
          password: 'Password123!',
          role: 'staff',
        }),
      });
      expect(teamCreateRes.status).toBe(403);
    }
  });

  it('allows owners to list, register, and update team accounts while blocking self-modification', async () => {
    const { gateway } = createFakeGateway();
    const app = createApp({ config: TEST_CONFIG, gateway });
    const ownerCookie = { Cookie: 'mk_access_token=valid-access-token' };
    const ownerMutationHeaders = { ...CSRF_HEADERS, ...ownerCookie };

    const listRes = await app.request('/api/v1/admin/users', { headers: ownerCookie });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { data: AdminTeamMember[] };
    expect(listBody.data).toHaveLength(3);

    const createRes = await app.request('/api/v1/admin/users', {
      method: 'POST',
      headers: ownerMutationHeaders,
      body: JSON.stringify({
        email: '  Cashier2@EightBurgers.Local ',
        password: 'CashierPass123!',
        role: 'cashier',
      }),
    });
    expect(createRes.status).toBe(201);
    const created = ((await createRes.json()) as { data: AdminTeamMember }).data;
    expect(created.email).toBe('cashier2@eightburgers.local');
    expect(created.role).toBe('cashier');
    expect(created.active).toBe(true);

    // Duplicate email rejected with 409 EMAIL_ALREADY_REGISTERED
    const dupRes = await app.request('/api/v1/admin/users', {
      method: 'POST',
      headers: ownerMutationHeaders,
      body: JSON.stringify({
        email: 'cashier2@eightburgers.local',
        password: 'CashierPass123!',
        role: 'staff',
      }),
    });
    expect(dupRes.status).toBe(409);
    expect(((await dupRes.json()) as { code: string }).code).toBe('EMAIL_ALREADY_REGISTERED');

    // Update role and disable newly created user
    const patchRes = await app.request(`/api/v1/admin/users/${created.id}`, {
      method: 'PATCH',
      headers: ownerMutationHeaders,
      body: JSON.stringify({ role: 'staff', active: false }),
    });
    expect(patchRes.status).toBe(200);
    const updated = ((await patchRes.json()) as { data: AdminTeamMember }).data;
    expect(updated.role).toBe('staff');
    expect(updated.active).toBe(false);

    // Owner cannot modify or disable their own account
    const selfPatchRes = await app.request(`/api/v1/admin/users/${ADMIN_USER.id}`, {
      method: 'PATCH',
      headers: ownerMutationHeaders,
      body: JSON.stringify({ active: false }),
    });
    expect(selfPatchRes.status).toBe(400);
    expect(((await selfPatchRes.json()) as { code: string }).code).toBe('CANNOT_MODIFY_SELF');
  });

  it('proxies address search and reverse geocoding with validation, rate limiting, and error handling', async () => {
    const { gateway } = createFakeGateway();
    const limiter = new SlidingWindowRateLimiter(4, 60_000, () => 1_000);
    let failSearch = false;

    const app = createApp({
      config: TEST_CONFIG,
      gateway,
      locationRateLimiter: limiter,
      locationProvider: {
        search: async (query) => {
          if (failSearch) {
            throw new Error('Upstream unavailable');
          }
          return [
            {
              id: 'osm-w-1',
              label: `6749 ${query}`,
              secondaryLabel: 'Makati, Metro Manila',
              coordinates: { lat: 14.5547, lng: 121.0244 },
            },
          ];
        },
        reverse: async (coords) =>
          coords.lat > 14.5
            ? { label: 'Chino Roces Avenue, San Antonio, Makati', coordinates: coords }
            : null,
      },
    });

    // Validation: query shorter than 2 chars -> 400
    const shortRes = await app.request('/api/v1/location/search?q=a');
    expect(shortRes.status).toBe(400);
    expect(((await shortRes.json()) as { code: string }).code).toBe('VALIDATION_ERROR');

    // Valid search -> 200
    const searchRes = await app.request('/api/v1/location/search?q=Ayala%20Ave');
    expect(searchRes.status).toBe(200);
    expect(searchRes.headers.get('cache-control')).toBe('public, max-age=300');
    const searchBody = (await searchRes.json()) as {
      data: Array<{ id: string; label: string; coordinates: { lat: number; lng: number } }>;
    };
    expect(searchBody.data).toHaveLength(1);
    expect(searchBody.data[0]?.label).toBe('6749 Ayala Ave');

    // Reverse geocoding: invalid coords -> 400, valid coords -> 200
    const badReverseRes = await app.request('/api/v1/location/reverse?lat=999&lng=121');
    expect(badReverseRes.status).toBe(400);

    const reverseRes = await app.request('/api/v1/location/reverse?lat=14.5608&lng=121.0124');
    expect(reverseRes.status).toBe(200);
    const reverseBody = (await reverseRes.json()) as {
      data: { label: string; coordinates: { lat: number; lng: number } } | null;
    };
    expect(reverseBody.data?.label).toBe('Chino Roces Avenue, San Antonio, Makati');

    // 4th request exceeds test limiter (max 3) -> 429 with Retry-After
    const rateLimitedRes = await app.request('/api/v1/location/reverse?lat=14.1&lng=121.0');
    expect(rateLimitedRes.status).toBe(429);
    expect(rateLimitedRes.headers.get('retry-after')).toBeTruthy();

    // Fresh limiter to test null reverse result and 503 search failure
    const app2 = createApp({
      config: TEST_CONFIG,
      gateway,
      locationProvider: {
        search: async () => {
          failSearch = true;
          throw new Error('Photon down');
        },
        reverse: async () => null,
      },
    });
    const nullReverseRes = await app2.request('/api/v1/location/reverse?lat=14.1&lng=121.0');
    expect(nullReverseRes.status).toBe(200);
    expect(((await nullReverseRes.json()) as { data: unknown }).data).toBeNull();

    const failSearchRes = await app2.request('/api/v1/location/search?q=Makati');
    expect(failSearchRes.status).toBe(503);
    expect(((await failSearchRes.json()) as { code: string }).code).toBe(
      'LOCATION_SERVICE_UNAVAILABLE',
    );
  });

  it('validates location query bounds, rejects empty/non-numeric coordinates, and degrades unexpected reverse errors cleanly', async () => {
    const { gateway } = createFakeGateway();
    const app = createApp({
      config: TEST_CONFIG,
      gateway,
      locationProvider: {
        search: async () => [],
        reverse: async () => {
          throw new Error('Nominatim crashed');
        },
      },
    });

    for (const badPath of [
      '/api/v1/location/search',
      '/api/v1/location/search?q=%20%20',
      `/api/v1/location/search?q=${'x'.repeat(121)}`,
    ]) {
      const res = await app.request(badPath);
      expect(res.status).toBe(400);
      expect(res.headers.get('content-type')).toContain('application/problem+json');
      const body = (await res.json()) as {
        code: string;
        fieldErrors?: Record<string, string[]>;
      };
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.fieldErrors?.q?.length).toBeGreaterThan(0);
    }

    for (const badReversePath of [
      '/api/v1/location/reverse',
      '/api/v1/location/reverse?lat=&lng=',
      '/api/v1/location/reverse?lng=121.01',
      '/api/v1/location/reverse?lat=14.56&lng=abc',
    ]) {
      const res = await app.request(badReversePath);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { code: string }).code).toBe('VALIDATION_ERROR');
    }

    const thrownReverseRes = await app.request('/api/v1/location/reverse?lat=14.56&lng=121.01');
    expect(thrownReverseRes.status).toBe(200);
    expect(((await thrownReverseRes.json()) as { data: unknown }).data).toBeNull();
  });

  it('supports Owner-only store profile updates, optimistic concurrency, delivery-requires-pin guard, and dynamic/legacy queue tracking', async () => {
    const { gateway, state } = createFakeGateway();
    const app = createApp({ config: TEST_CONFIG, gateway });
    const ownerHeaders = { ...CSRF_HEADERS, Cookie: 'mk_access_token=valid-access-token' };
    const cashierHeaders = { ...CSRF_HEADERS, Cookie: 'mk_access_token=cashier-access-token' };
    const staffHeaders = { ...CSRF_HEADERS, Cookie: 'mk_access_token=staff-access-token' };

    // Catalog includes store profile and live originCoords
    const initialCatalogRes = await app.request('/api/v1/catalog');
    expect(initialCatalogRes.status).toBe(200);
    const initialCatalog = (await initialCatalogRes.json()) as {
      data: { store: StoreProfile; deliveryPricing: DeliveryPricingConfig };
    };
    expect(initialCatalog.data.store.storeName).toBe('8Burgers');
    expect(initialCatalog.data.store.originCoords).toEqual(STORE_ORIGIN_COORDS);
    expect(initialCatalog.data.deliveryPricing.originCoords).toEqual(STORE_ORIGIN_COORDS);

    // Seed an order under the old 8B prefix before rebranding
    const legacyOrderRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': 'legacy-prefix-order-123456' },
      body: JSON.stringify({
        customerName: 'Legacy Guest',
        contactNumber: '',
        fulfillment: 'pickup',
        addressOrNotes: '',
        paymentMethod: 'cash',
        items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
      }),
    });
    expect(legacyOrderRes.status).toBe(201);
    expect(((await legacyOrderRes.json()) as { data: OrderRecord }).data.queueNumber).toBe(
      '#8B-101',
    );

    // Cashier and Staff are forbidden from updating store profile (403)
    for (const headers of [cashierHeaders, staffHeaders]) {
      const forbiddenRes = await app.request('/api/v1/admin/store-profile', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ storeName: 'Hijacked Shop' }),
      });
      expect(forbiddenRes.status).toBe(403);
      expect(((await forbiddenRes.json()) as { code: string }).code).toBe('INSUFFICIENT_ROLE');
    }

    // Invalid custom theme (missing hex) and unsafe external link rejected with 400
    const badThemeRes = await app.request('/api/v1/admin/store-profile', {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({ themeAccentPreset: 'custom' }),
    });
    expect(badThemeRes.status).toBe(400);

    const badLinkRes = await app.request('/api/v1/admin/store-profile', {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({
        externalLinks: [{ label: 'Unsafe', url: 'http://example.com' }],
      }),
    });
    expect(badLinkRes.status).toBe(400);

    // Clearing originCoords while delivery is enabled is rejected with 422 DELIVERY_ORIGIN_REQUIRED
    const clearPinWhileDeliveryEnabled = await app.request('/api/v1/admin/store-profile', {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({ originCoords: null, expectedVersion: 1 }),
    });
    expect(clearPinWhileDeliveryEnabled.status).toBe(422);
    expect(((await clearPinWhileDeliveryEnabled.json()) as { code: string }).code).toBe(
      'DELIVERY_ORIGIN_REQUIRED',
    );

    // Owner updates store profile (rebrand to Kape Kanto in Cebu) -> 200
    const rebrandRes = await app.request('/api/v1/admin/store-profile', {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({
        storeName: 'Kape Kanto',
        branchLabel: 'IT Park, Cebu City',
        monogram: 'KK',
        queuePrefix: 'kk',
        preparingStageLabel: 'Brewing',
        themeAccentPreset: 'matcha',
        externalLinks: [{ label: 'Instagram', url: 'https://instagram.com/kapekanto' }],
        originCoords: { lat: 10.3293, lng: 123.9061 },
        expectedVersion: 1,
      }),
    });
    expect(rebrandRes.status).toBe(200);
    const rebranded = ((await rebrandRes.json()) as { data: StoreProfile }).data;
    expect(rebranded.storeName).toBe('Kape Kanto');
    expect(rebranded.queuePrefix).toBe('KK');
    expect(rebranded.themeAccentPreset).toBe('matcha');
    expect(rebranded.originCoords).toEqual({ lat: 10.3293, lng: 123.9061 });
    expect(rebranded.version).toBe(2);

    // Stale expectedVersion returns 409 CONFLICT
    const staleProfileRes = await app.request('/api/v1/admin/store-profile', {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({ storeName: 'Stale Write', expectedVersion: 1 }),
    });
    expect(staleProfileRes.status).toBe(409);

    // New order mints #KK-102; tracking by numeric '102' uses live prefix KK while legacy '8B-101' stays trackable
    const newPrefixOrderRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': 'new-prefix-order-123456' },
      body: JSON.stringify({
        customerName: 'Cebu Guest',
        contactNumber: '',
        fulfillment: 'pickup',
        addressOrNotes: '',
        paymentMethod: 'cash',
        items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
      }),
    });
    expect(newPrefixOrderRes.status).toBe(201);
    expect(((await newPrefixOrderRes.json()) as { data: OrderRecord }).data.queueNumber).toBe(
      '#KK-102',
    );

    const trackNumericRes = await app.request('/api/v1/orders/track/102');
    expect(trackNumericRes.status).toBe(200);
    expect(((await trackNumericRes.json()) as { data: PublicOrderTracker }).data.queueNumber).toBe(
      '#KK-102',
    );

    const trackLegacyRes = await app.request('/api/v1/orders/track/8B-101');
    expect(trackLegacyRes.status).toBe(200);
    expect(((await trackLegacyRes.json()) as { data: PublicOrderTracker }).data.queueNumber).toBe(
      '#8B-101',
    );

    // Disable delivery -> clear origin pin -> attempting to enable delivery without pin returns 422
    const disableDeliveryRes = await app.request('/api/v1/admin/delivery-pricing', {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({ deliveryEnabled: false, expectedVersion: 2 }),
    });
    expect(disableDeliveryRes.status).toBe(200);

    const clearPinRes = await app.request('/api/v1/admin/store-profile', {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({ originCoords: null, expectedVersion: 3 }),
    });
    expect(clearPinRes.status).toBe(200);
    expect(state.storeProfile.originCoords).toBeNull();

    const enableDeliveryWithoutPin = await app.request('/api/v1/admin/delivery-pricing', {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({ deliveryEnabled: true, expectedVersion: 4 }),
    });
    expect(enableDeliveryWithoutPin.status).toBe(422);
    expect(((await enableDeliveryWithoutPin.json()) as { code: string }).code).toBe(
      'DELIVERY_ORIGIN_REQUIRED',
    );

    // Delivery error copy is brand-neutral (no Chino Roces / Metro Manila)
    const pausedDeliveryOrderRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': 'brand-neutral-delivery-err-1' },
      body: JSON.stringify({
        customerName: 'Guest',
        contactNumber: '09171234567',
        fulfillment: 'delivery',
        deliveryPin: { lat: 10.3293, lng: 123.9061 },
        addressOrNotes: 'Cebu IT Park',
        paymentMethod: 'cash',
        items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
      }),
    });
    expect(pausedDeliveryOrderRes.status).toBe(422);
    const pausedDeliveryBody = (await pausedDeliveryOrderRes.json()) as {
      code: string;
      detail: string;
    };
    expect(pausedDeliveryBody.code).toBe('DELIVERY_UNAVAILABLE');
    expect(pausedDeliveryBody.detail).not.toMatch(/Chino Roces|Metro Manila/i);
  });

  it('allows Owner and Cashier to toggle ordering status, blocks Staff, and rejects checkout with 422 STORE_CLOSED', async () => {
    const { gateway, state } = createFakeGateway();
    const app = createApp({ config: TEST_CONFIG, gateway });
    const ownerHeaders = { ...CSRF_HEADERS, Cookie: 'mk_access_token=valid-access-token' };
    const cashierHeaders = { ...CSRF_HEADERS, Cookie: 'mk_access_token=cashier-access-token' };
    const staffHeaders = { ...CSRF_HEADERS, Cookie: 'mk_access_token=staff-access-token' };

    // Staff receives 403 INSUFFICIENT_ROLE
    const staffPauseRes = await app.request('/api/v1/admin/store-ordering-status', {
      method: 'PATCH',
      headers: staffHeaders,
      body: JSON.stringify({ acceptingOrders: false }),
    });
    expect(staffPauseRes.status).toBe(403);
    expect(((await staffPauseRes.json()) as { code: string }).code).toBe('INSUFFICIENT_ROLE');

    // Cashier pauses orders with a custom closedNotice -> 200
    const cashierPauseRes = await app.request('/api/v1/admin/store-ordering-status', {
      method: 'PATCH',
      headers: cashierHeaders,
      body: JSON.stringify({
        acceptingOrders: false,
        closedNotice: 'Kitchen break until 2:00 PM',
        expectedVersion: 1,
      }),
    });
    expect(cashierPauseRes.status).toBe(200);
    const pausedStore = ((await cashierPauseRes.json()) as { data: StoreProfile }).data;
    expect(pausedStore.acceptingOrders).toBe(false);
    expect(pausedStore.closedNotice).toBe('Kitchen break until 2:00 PM');
    expect(pausedStore.version).toBe(2);

    // Checkout is rejected with 422 STORE_CLOSED including closedNotice without burning queue seq
    const closedCheckoutRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': 'closed-store-order-key-123456' },
      body: JSON.stringify({
        customerName: 'Marco',
        contactNumber: '09171234567',
        fulfillment: 'pickup',
        addressOrNotes: '',
        paymentMethod: 'cash',
        items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
      }),
    });
    expect(closedCheckoutRes.status).toBe(422);
    const closedBody = (await closedCheckoutRes.json()) as {
      code: string;
      detail: string;
      closedNotice?: string;
    };
    expect(closedBody.code).toBe('STORE_CLOSED');
    expect(closedBody.closedNotice).toBe('Kitchen break until 2:00 PM');
    expect(closedBody.detail).toContain('Kitchen break until 2:00 PM');
    expect(state.seq).toBe(101);
    expect(state.orders.size).toBe(0);

    // Stale expectedVersion returns 409 CONFLICT
    const staleResumeRes = await app.request('/api/v1/admin/store-ordering-status', {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({ acceptingOrders: true, expectedVersion: 1 }),
    });
    expect(staleResumeRes.status).toBe(409);

    // Owner resumes orders -> 200 and checkout succeeds
    const ownerResumeRes = await app.request('/api/v1/admin/store-ordering-status', {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({
        acceptingOrders: true,
        closedNotice: '',
        expectedVersion: 2,
      }),
    });
    expect(ownerResumeRes.status).toBe(200);

    const resumedCheckoutRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': 'closed-store-order-key-123456' },
      body: JSON.stringify({
        customerName: 'Marco',
        contactNumber: '09171234567',
        fulfillment: 'pickup',
        addressOrNotes: '',
        paymentMethod: 'cash',
        items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
      }),
    });
    expect(resumedCheckoutRes.status).toBe(201);
  });

  it('uploads and cleans up store assets (logo, hero, payment-qr) with Owner-only RBAC and purpose validation', async () => {
    const { gateway, state } = createFakeGateway();
    const seenPurposes: Array<AssetUploadPurpose | undefined> = [];
    const app = createApp({
      config: TEST_CONFIG,
      gateway,
      optimizeMenuImage: async (buf, purpose) => {
        seenPurposes.push(purpose);
        return {
          buffer: buf,
          width: purpose === 'logo' ? 512 : purpose === 'hero' ? 1600 : 800,
          height: purpose === 'logo' ? 512 : purpose === 'hero' ? 900 : 800,
          sizeBytes: 12_345,
          contentType: 'image/webp',
        };
      },
    });

    const ownerUploadHeaders = {
      Origin: 'http://localhost:5173',
      'X-Requested-With': 'fetch',
      Cookie: 'mk_access_token=valid-access-token',
    };

    // Cashier is forbidden from uploading or deleting store assets (403)
    const cashierForm = new FormData();
    cashierForm.append('purpose', 'logo');
    cashierForm.append(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' }),
    );
    const cashierUploadRes = await app.request('/api/v1/admin/store-assets', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'X-Requested-With': 'fetch',
        Cookie: 'mk_access_token=cashier-access-token',
      },
      body: cashierForm,
    });
    expect(cashierUploadRes.status).toBe(403);

    const cashierDeleteRes = await app.request('/api/v1/admin/store-assets', {
      method: 'DELETE',
      headers: { ...CSRF_HEADERS, Cookie: 'mk_access_token=cashier-access-token' },
      body: JSON.stringify({
        imageUrl:
          '/storage/v1/object/public/menu-images/branding/11111111-2222-4333-8444-555555555555.webp',
      }),
    });
    expect(cashierDeleteRes.status).toBe(403);

    // Invalid purpose ('item' or missing) returns 400 VALIDATION_ERROR
    const invalidPurposeForm = new FormData();
    invalidPurposeForm.append('purpose', 'item');
    invalidPurposeForm.append(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' }),
    );
    const badPurposeRes = await app.request('/api/v1/admin/store-assets', {
      method: 'POST',
      headers: ownerUploadHeaders,
      body: invalidPurposeForm,
    });
    expect(badPurposeRes.status).toBe(400);
    expect(((await badPurposeRes.json()) as { code: string }).code).toBe('VALIDATION_ERROR');

    // Owner uploads logo -> branding/ and payment-qr -> payment-qr/
    const logoForm = new FormData();
    logoForm.append('purpose', 'logo');
    logoForm.append(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' }),
    );
    const logoRes = await app.request('/api/v1/admin/store-assets', {
      method: 'POST',
      headers: ownerUploadHeaders,
      body: logoForm,
    });
    expect(logoRes.status).toBe(201);
    const logoData = (
      (await logoRes.json()) as {
        data: { imageUrl: string; path: string; purpose: string; width: number };
      }
    ).data;
    expect(logoData.purpose).toBe('logo');
    expect(logoData.path).toMatch(/^branding\//);
    expect(logoData.width).toBe(512);

    const qrForm = new FormData();
    qrForm.append('purpose', 'payment-qr');
    qrForm.append('file', new File([new Uint8Array([1, 2, 3])], 'qr.png', { type: 'image/png' }));
    const qrRes = await app.request('/api/v1/admin/store-assets', {
      method: 'POST',
      headers: ownerUploadHeaders,
      body: qrForm,
    });
    expect(qrRes.status).toBe(201);
    const qrData = (
      (await qrRes.json()) as {
        data: { imageUrl: string; path: string; purpose: string; width: number };
      }
    ).data;
    expect(qrData.purpose).toBe('payment-qr');
    expect(qrData.path).toMatch(/^payment-qr\//);
    expect(seenPurposes).toEqual(['logo', 'payment-qr']);

    // Save logo to store profile, then attempt to delete it -> ignored (stays in storage)
    const saveLogoRes = await app.request('/api/v1/admin/store-profile', {
      method: 'PATCH',
      headers: { ...CSRF_HEADERS, Cookie: 'mk_access_token=valid-access-token' },
      body: JSON.stringify({ logoUrl: logoData.imageUrl, expectedVersion: 1 }),
    });
    expect(saveLogoRes.status).toBe(200);

    const deleteActiveLogoRes = await app.request('/api/v1/admin/store-assets', {
      method: 'DELETE',
      headers: { ...CSRF_HEADERS, Cookie: 'mk_access_token=valid-access-token' },
      body: JSON.stringify({ imageUrl: logoData.imageUrl }),
    });
    expect(deleteActiveLogoRes.status).toBe(204);
    expect(state.uploadedImages.has(logoData.imageUrl)).toBe(true);

    // Delete unsaved QR asset -> removed cleanly
    const deleteUnusedQrRes = await app.request('/api/v1/admin/store-assets', {
      method: 'DELETE',
      headers: { ...CSRF_HEADERS, Cookie: 'mk_access_token=valid-access-token' },
      body: JSON.stringify({ imageUrl: qrData.imageUrl }),
    });
    expect(deleteUnusedQrRes.status).toBe(204);
    expect(state.uploadedImages.has(qrData.imageUrl)).toBe(false);
  });

  it('biases location search by cached store originCoords and invalidates cache immediately on profile pin update', async () => {
    const { gateway } = createFakeGateway();
    const getStoreProfileSpy = vi.spyOn(gateway, 'getStoreProfile');
    const seenOrigins: Array<GeoCoordinates | null | undefined> = [];

    const app = createApp({
      config: TEST_CONFIG,
      gateway,
      locationProvider: {
        search: async (query, _signal, biasOrigin) => {
          seenOrigins.push(biasOrigin);
          return [
            {
              id: 'osm-n-1',
              label: query,
              coordinates: biasOrigin ?? { lat: 14.5995, lng: 120.9842 },
            },
          ];
        },
        reverse: async () => null,
      },
    });

    // Two searches hit the 60s store profile cache (getStoreProfile called once)
    const firstRes = await app.request('/api/v1/location/search?q=Ayala');
    expect(firstRes.status).toBe(200);
    const secondRes = await app.request('/api/v1/location/search?q=Makati');
    expect(secondRes.status).toBe(200);
    expect(getStoreProfileSpy).toHaveBeenCalledTimes(1);
    expect(seenOrigins).toEqual([STORE_ORIGIN_COORDS, STORE_ORIGIN_COORDS]);

    // Updating originCoords invalidates the store profile cache immediately
    const cebuPin = { lat: 10.3157, lng: 123.8854 };
    const pinUpdateRes = await app.request('/api/v1/admin/store-profile', {
      method: 'PATCH',
      headers: { ...CSRF_HEADERS, Cookie: 'mk_access_token=valid-access-token' },
      body: JSON.stringify({ originCoords: cebuPin, expectedVersion: 1 }),
    });
    expect(pinUpdateRes.status).toBe(200);

    const thirdRes = await app.request('/api/v1/location/search?q=IT%20Park');
    expect(thirdRes.status).toBe(200);
    expect(getStoreProfileSpy).toHaveBeenCalledTimes(2);
    expect(seenOrigins[2]).toEqual(cebuPin);
  });

  it('supports Owner-only categories CRUD, reordering, slug conflicts, and 409 CATEGORY_IN_USE guard', async () => {
    const { gateway } = createFakeGateway();
    const app = createApp({ config: TEST_CONFIG, gateway });
    const ownerHeaders = { ...CSRF_HEADERS, Cookie: 'mk_access_token=valid-access-token' };
    const cashierHeaders = { ...CSRF_HEADERS, Cookie: 'mk_access_token=cashier-access-token' };
    const staffHeaders = { ...CSRF_HEADERS, Cookie: 'mk_access_token=staff-access-token' };

    // Catalog includes seeded categories and optionGroups
    const catalogRes = await app.request('/api/v1/catalog');
    expect(catalogRes.status).toBe(200);
    const catalogJson = (await catalogRes.json()) as {
      data: { categories: MenuCategory[]; optionGroups: OptionGroup[] };
    };
    expect(catalogJson.data.categories.length).toBeGreaterThanOrEqual(4);
    expect(catalogJson.data.optionGroups[0]?.id).toBe('add-ons');

    // Cashier and Staff cannot create/update/reorder/delete categories (403)
    for (const headers of [cashierHeaders, staffHeaders]) {
      const forbiddenCreate = await app.request('/api/v1/admin/categories', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Drinks' }),
      });
      expect(forbiddenCreate.status).toBe(403);
    }

    // Owner creates a new category -> 201
    const createRes = await app.request('/api/v1/admin/categories', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: 'Espresso & Coffee',
        description: 'Hot and iced espresso drinks.',
      }),
    });
    expect(createRes.status).toBe(201);
    const created = ((await createRes.json()) as { data: MenuCategory }).data;
    expect(created.id).toBe('espresso-coffee');
    expect(created.version).toBe(1);

    // Duplicate explicit slug returns 409 CATEGORY_ALREADY_EXISTS
    const dupRes = await app.request('/api/v1/admin/categories', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ id: 'espresso-coffee', name: 'Espresso Duplicate' }),
    });
    expect(dupRes.status).toBe(409);
    expect(((await dupRes.json()) as { code: string }).code).toBe('CATEGORY_ALREADY_EXISTS');

    // Patch category with optimistic concurrency
    const patchRes = await app.request(`/api/v1/admin/categories/${created.id}`, {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({ name: 'Espresso Bar', active: false, expectedVersion: 1 }),
    });
    expect(patchRes.status).toBe(200);
    const patched = ((await patchRes.json()) as { data: MenuCategory }).data;
    expect(patched.name).toBe('Espresso Bar');
    expect(patched.active).toBe(false);
    expect(patched.version).toBe(2);

    const stalePatch = await app.request(`/api/v1/admin/categories/${created.id}`, {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({ name: 'Stale', expectedVersion: 1 }),
    });
    expect(stalePatch.status).toBe(409);

    // Reorder categories moves Espresso Bar to first
    const reorderRes = await app.request('/api/v1/admin/categories/reorder', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        orderedIds: ['espresso-coffee', 'classic-burgers', 'specialty-burgers'],
      }),
    });
    expect(reorderRes.status).toBe(200);
    const reordered = ((await reorderRes.json()) as { data: MenuCategory[] }).data;
    expect(reordered[0]?.id).toBe('espresso-coffee');
    expect(reordered[0]?.sortOrder).toBe(1);

    // Deleting a category still referenced by menu items returns 409 CATEGORY_IN_USE
    const inUseDelete = await app.request('/api/v1/admin/categories/classic-burgers', {
      method: 'DELETE',
      headers: {
        Origin: 'http://localhost:5173',
        'X-Requested-With': 'fetch',
        Cookie: 'mk_access_token=valid-access-token',
      },
    });
    expect(inUseDelete.status).toBe(409);
    expect(((await inUseDelete.json()) as { code: string }).code).toBe('CATEGORY_IN_USE');

    // Deleting an unused category succeeds (204)
    const cleanDelete = await app.request(`/api/v1/admin/categories/${created.id}`, {
      method: 'DELETE',
      headers: {
        Origin: 'http://localhost:5173',
        'X-Requested-With': 'fetch',
        Cookie: 'mk_access_token=valid-access-token',
      },
    });
    expect(cleanDelete.status).toBe(204);
  });

  it('supports option groups CRUD, 409 OPTION_GROUP_IN_USE, Staff choice stock toggles, checkout option validation, and tracker note redaction', async () => {
    const { gateway } = createFakeGateway();
    const app = createApp({ config: TEST_CONFIG, gateway });
    const ownerHeaders = { ...CSRF_HEADERS, Cookie: 'mk_access_token=valid-access-token' };
    const staffHeaders = { ...CSRF_HEADERS, Cookie: 'mk_access_token=staff-access-token' };

    // Create a required single-select Size group and a multi-select Max-2 Toppings group
    const sizeGroupRes = await app.request('/api/v1/admin/option-groups', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        id: 'drink-size',
        name: 'Size',
        selectionMode: 'single',
        required: true,
        minSelect: 1,
        maxSelect: 1,
        choices: [
          { id: 'size-regular', name: 'Regular', priceDeltaPhp: 0, isDefault: true },
          { id: 'size-large', name: 'Large', priceDeltaPhp: 30, isDefault: false },
        ],
      }),
    });
    expect(sizeGroupRes.status).toBe(201);
    const sizeGroup = ((await sizeGroupRes.json()) as { data: OptionGroup }).data;
    expect(sizeGroup.choices).toHaveLength(2);

    const milkGroupRes = await app.request('/api/v1/admin/option-groups', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        id: 'milk-extras',
        name: 'Milk & Extras',
        selectionMode: 'multi',
        required: false,
        minSelect: 0,
        maxSelect: 1,
        choices: [
          { id: 'oat-milk', name: 'Oat Milk', priceDeltaPhp: 40 },
          { id: 'espresso-shot', name: 'Extra Shot', priceDeltaPhp: 35 },
        ],
      }),
    });
    expect(milkGroupRes.status).toBe(201);

    // Invalid group invariants rejected with 400
    const badGroupRes = await app.request('/api/v1/admin/option-groups', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: 'Bad Single',
        selectionMode: 'single',
        required: true,
        minSelect: 1,
        maxSelect: 2,
        choices: [],
      }),
    });
    expect(badGroupRes.status).toBe(400);

    // Create a menu item linked to both drink-size and milk-extras
    const createDrinkRes = await app.request('/api/v1/admin/menu-items', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: 'Iced Matcha Latte',
        category: 'classic-burgers',
        pricePhp: 150,
        specLabel: '16oz Cold Brew',
        description: 'Ceremonial matcha over cold milk.',
        imageUrl: '',
        available: true,
        featured: true,
        optionGroupIds: ['drink-size', 'milk-extras'],
      }),
    });
    expect(createDrinkRes.status).toBe(201);
    const drinkItem = ((await createDrinkRes.json()) as { data: MenuItem }).data;
    expect(drinkItem.optionGroupIds).toEqual(['drink-size', 'milk-extras']);

    // Deleting a linked option group returns 409 OPTION_GROUP_IN_USE
    const deleteInUseGroup = await app.request('/api/v1/admin/option-groups/drink-size', {
      method: 'DELETE',
      headers: {
        Origin: 'http://localhost:5173',
        'X-Requested-With': 'fetch',
        Cookie: 'mk_access_token=valid-access-token',
      },
    });
    expect(deleteInUseGroup.status).toBe(409);
    expect(((await deleteInUseGroup.json()) as { code: string }).code).toBe('OPTION_GROUP_IN_USE');

    // Missing required Size option -> 422 REQUIRED_OPTION_MISSING
    const missingReqRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': 'phase2-missing-req-opt-1234' },
      body: JSON.stringify({
        customerName: 'Marco',
        contactNumber: '',
        fulfillment: 'pickup',
        addressOrNotes: '',
        paymentMethod: 'cash',
        items: [{ itemId: drinkItem.id, quantity: 1, selectedOptionIds: [], itemNote: '' }],
      }),
    });
    expect(missingReqRes.status).toBe(422);
    expect(((await missingReqRes.json()) as { code: string }).code).toBe('REQUIRED_OPTION_MISSING');

    // Selecting more than maxSelect=1 in milk-extras -> 422 OPTION_LIMIT_EXCEEDED
    const overLimitRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': 'phase2-over-limit-opt-1234' },
      body: JSON.stringify({
        customerName: 'Marco',
        contactNumber: '',
        fulfillment: 'pickup',
        addressOrNotes: '',
        paymentMethod: 'cash',
        items: [
          {
            itemId: drinkItem.id,
            quantity: 1,
            selectedOptionIds: ['size-regular', 'oat-milk', 'espresso-shot'],
            itemNote: '',
          },
        ],
      }),
    });
    expect(overLimitRes.status).toBe(422);
    expect(((await overLimitRes.json()) as { code: string }).code).toBe('OPTION_LIMIT_EXCEEDED');

    // Selecting an option not linked to the item -> 422 INVALID_OPTION_SELECTION
    const invalidOptRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': 'phase2-invalid-opt-123456' },
      body: JSON.stringify({
        customerName: 'Marco',
        contactNumber: '',
        fulfillment: 'pickup',
        addressOrNotes: '',
        paymentMethod: 'cash',
        items: [
          {
            itemId: drinkItem.id,
            quantity: 1,
            selectedOptionIds: ['size-regular', 'bacon'],
            itemNote: '',
          },
        ],
      }),
    });
    expect(invalidOptRes.status).toBe(422);
    expect(((await invalidOptRes.json()) as { code: string }).code).toBe(
      'INVALID_OPTION_SELECTION',
    );

    // Staff toggles Oat Milk sold out (allowed via requireStaffPortal) -> 200
    const staffToggleChoiceRes = await app.request(
      '/api/v1/admin/option-choices/oat-milk/availability',
      {
        method: 'PATCH',
        headers: staffHeaders,
        body: JSON.stringify({ available: false, expectedVersion: 1 }),
      },
    );
    expect(staffToggleChoiceRes.status).toBe(200);
    expect(((await staffToggleChoiceRes.json()) as { data: OptionChoice }).data.available).toBe(
      false,
    );

    // Stale expectedVersion on choice availability returns 409 CONFLICT
    const staleToggleRes = await app.request('/api/v1/admin/option-choices/oat-milk/availability', {
      method: 'PATCH',
      headers: staffHeaders,
      body: JSON.stringify({ available: true, expectedVersion: 1 }),
    });
    expect(staleToggleRes.status).toBe(409);

    // Ordering sold-out Oat Milk returns 422 OPTION_UNAVAILABLE
    const soldOutOptRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': 'phase2-soldout-opt-123456' },
      body: JSON.stringify({
        customerName: 'Marco',
        contactNumber: '',
        fulfillment: 'pickup',
        addressOrNotes: '',
        paymentMethod: 'cash',
        items: [
          {
            itemId: drinkItem.id,
            quantity: 1,
            selectedOptionIds: ['size-large', 'oat-milk'],
            itemNote: '',
          },
        ],
      }),
    });
    expect(soldOutOptRes.status).toBe(422);
    expect(((await soldOutOptRes.json()) as { code: string }).code).toBe('OPTION_UNAVAILABLE');

    // Valid order with two distinct itemNote lines computes authoritative totals & redacts itemNote on public tracker
    const validKey = 'phase2-valid-order-notes-1234';
    const validOrderPayload = {
      customerName: 'Marco',
      contactNumber: '',
      fulfillment: 'pickup',
      addressOrNotes: '',
      paymentMethod: 'cash',
      items: [
        {
          itemId: drinkItem.id,
          quantity: 1,
          selectedOptionIds: ['size-large', 'espresso-shot'],
          itemNote: 'Less ice, call 0917-SECRET',
        },
        {
          itemId: drinkItem.id,
          quantity: 1,
          selectedOptionIds: ['size-large', 'espresso-shot'],
          itemNote: 'No sugar',
        },
      ],
    };

    const validOrderRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': validKey },
      body: JSON.stringify(validOrderPayload),
    });
    expect(validOrderRes.status).toBe(201);
    const createdBody = (await validOrderRes.json()) as {
      data: OrderRecord;
      receiptToken: string;
    };
    // Base 150 + Large 30 + Extra Shot 35 = 215 each -> 430 total
    expect(createdBody.data.totalPhp).toBe(430);
    expect(createdBody.data.lines).toHaveLength(2);
    expect(createdBody.data.lines[0]?.selectedOptions.map((o) => o.choiceName)).toEqual([
      'Large',
      'Extra Shot',
    ]);
    expect(createdBody.data.lines[0]?.itemNote).toBe('Less ice, call 0917-SECRET');

    // Mutating itemNote under same Idempotency-Key returns 409 IDEMPOTENCY_CONFLICT
    const mutatedNoteRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': validKey },
      body: JSON.stringify({
        ...validOrderPayload,
        items: [
          {
            ...validOrderPayload.items[0],
            itemNote: 'Changed note',
          },
          validOrderPayload.items[1],
        ],
      }),
    });
    expect(mutatedNoteRes.status).toBe(409);

    // Public queue tracker exposes option choice names while omitting free-text itemNote completely
    const trackerRes = await app.request(
      `/api/v1/orders/track/${encodeURIComponent(createdBody.data.queueNumber)}`,
    );
    expect(trackerRes.status).toBe(200);
    const trackerText = await trackerRes.text();
    expect(trackerText).not.toContain('0917-SECRET');
    expect(trackerText).not.toContain('Less ice');
    expect(trackerText).not.toContain('itemNote');
    const trackerJson = JSON.parse(trackerText) as { data: PublicOrderTracker };
    expect(trackerJson.data.lines[0]?.selectedOptionNames).toEqual(['Large', 'Extra Shot']);
    expect(trackerJson.data.lines[0]?.addonNames).toEqual(['Large', 'Extra Shot']);

    // Cross-group explicit choice.id collision is rejected with 409 without partially mutating the group
    const beforeCollisionGroups = await app.request('/api/v1/admin/option-groups', {
      headers: { Cookie: 'mk_access_token=valid-access-token' },
    });
    const beforeDrinkSize = (
      (await beforeCollisionGroups.json()) as { data: OptionGroup[] }
    ).data.find((group) => group.id === 'drink-size');
    expect(beforeDrinkSize?.name).toBe('Size');
    expect(beforeDrinkSize?.version).toBe(1);

    const crossGroupCollisionRes = await app.request('/api/v1/admin/option-groups/drink-size', {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: 'Should Not Persist',
        choices: [
          { id: 'size-regular', name: 'Regular', priceDeltaPhp: 0, isDefault: true },
          { id: 'oat-milk', name: 'Colliding Choice', priceDeltaPhp: 10, isDefault: false },
        ],
        expectedVersion: 1,
      }),
    });
    expect(crossGroupCollisionRes.status).toBe(409);
    expect(((await crossGroupCollisionRes.json()) as { code: string }).code).toBe(
      'OPTION_CHOICE_ALREADY_EXISTS',
    );

    const afterCollisionGroups = await app.request('/api/v1/admin/option-groups', {
      headers: { Cookie: 'mk_access_token=valid-access-token' },
    });
    const afterDrinkSize = (
      (await afterCollisionGroups.json()) as { data: OptionGroup[] }
    ).data.find((group) => group.id === 'drink-size');
    expect(afterDrinkSize?.name).toBe('Size');
    expect(afterDrinkSize?.version).toBe(1);
  });

  it('supports configurable fulfillment, dine-in table validation, payment QR lifecycle, receipt payment-reference updates, self-cancel blocking, and Cashier payment confirmation', async () => {
    const { gateway, state } = createFakeGateway();
    const app = createApp({
      config: TEST_CONFIG,
      gateway,
      optimizeMenuImage: async (buf) => ({
        buffer: buf,
        width: 800,
        height: 800,
        sizeBytes: 18_000,
        contentType: 'image/webp',
      }),
    });
    const ownerCookie = { Cookie: 'mk_access_token=valid-access-token' };
    const ownerHeaders = { ...CSRF_HEADERS, ...ownerCookie };
    const cashierHeaders = { ...CSRF_HEADERS, Cookie: 'mk_access_token=cashier-access-token' };
    const staffHeaders = { ...CSRF_HEADERS, Cookie: 'mk_access_token=staff-access-token' };

    // 1. Disabled fulfillment (dine-in) and disabled payment method (bank_transfer) are rejected with 422
    const disabledDineInRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': 'phase3-disabled-dinein-1234' },
      body: JSON.stringify({
        customerName: 'Marco',
        contactNumber: '',
        fulfillment: 'dine-in',
        tableNumber: '7',
        addressOrNotes: '',
        paymentMethod: 'cash',
        items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [], itemNote: '' }],
      }),
    });
    expect(disabledDineInRes.status).toBe(422);
    expect(((await disabledDineInRes.json()) as { code: string }).code).toBe(
      'FULFILLMENT_UNAVAILABLE',
    );

    const disabledBankRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': 'phase3-disabled-bank-12345' },
      body: JSON.stringify({
        customerName: 'Marco',
        contactNumber: '',
        fulfillment: 'pickup',
        addressOrNotes: '',
        paymentMethod: 'bank_transfer',
        items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [], itemNote: '' }],
      }),
    });
    expect(disabledBankRes.status).toBe(422);
    expect(((await disabledBankRes.json()) as { code: string }).code).toBe(
      'PAYMENT_METHOD_UNAVAILABLE',
    );

    // 2. Owner uploads two payment-qr images, enables dine-in + GCash QR, then replaces QR -> old QR cleaned up
    const qrForm1 = new FormData();
    qrForm1.append('purpose', 'payment-qr');
    qrForm1.append(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'gcash1.png', { type: 'image/png' }),
    );
    const qrUpload1 = await app.request('/api/v1/admin/store-assets', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173', 'X-Requested-With': 'fetch', ...ownerCookie },
      body: qrForm1,
    });
    expect(qrUpload1.status).toBe(201);
    const qr1Url = ((await qrUpload1.json()) as { data: { imageUrl: string } }).data.imageUrl;

    const qrForm2 = new FormData();
    qrForm2.append('purpose', 'payment-qr');
    qrForm2.append(
      'file',
      new File([new Uint8Array([4, 5, 6])], 'gcash2.png', { type: 'image/png' }),
    );
    const qrUpload2 = await app.request('/api/v1/admin/store-assets', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173', 'X-Requested-With': 'fetch', ...ownerCookie },
      body: qrForm2,
    });
    expect(qrUpload2.status).toBe(201);
    const qr2Url = ((await qrUpload2.json()) as { data: { imageUrl: string } }).data.imageUrl;

    const enableConfigRes = await app.request('/api/v1/admin/store-profile', {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({
        dineInEnabled: true,
        dineInTableRequired: true,
        paymentMethods: {
          ...state.storeProfile.paymentMethods,
          gcash: {
            enabled: true,
            label: 'GCash',
            accountName: 'Kape Kanto',
            accountNumber: '09171234567',
            instructions: 'Send exact total and paste ref.',
            qrImageUrl: qr1Url,
          },
          bank_transfer: {
            ...state.storeProfile.paymentMethods.bank_transfer,
            enabled: true,
            accountName: 'Kape Kanto Inc.',
            accountNumber: '1234-5678-90',
          },
        },
        expectedVersion: 1,
      }),
    });
    expect(enableConfigRes.status).toBe(200);

    // Active payment QR is protected from DELETE /admin/store-assets
    const deleteActiveQr = await app.request('/api/v1/admin/store-assets', {
      method: 'DELETE',
      headers: ownerHeaders,
      body: JSON.stringify({ imageUrl: qr1Url }),
    });
    expect(deleteActiveQr.status).toBe(204);
    expect(state.uploadedImages.has(qr1Url)).toBe(true);

    // Replacing qr1Url with qr2Url cleans up qr1Url automatically
    const replaceQrRes = await app.request('/api/v1/admin/store-profile', {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({
        paymentMethods: {
          ...state.storeProfile.paymentMethods,
          gcash: {
            ...state.storeProfile.paymentMethods.gcash,
            qrImageUrl: qr2Url,
          },
        },
        expectedVersion: 2,
      }),
    });
    expect(replaceQrRes.status).toBe(200);
    expect(state.uploadedImages.has(qr1Url)).toBe(false);
    expect(state.uploadedImages.has(qr2Url)).toBe(true);

    // Disabling all fulfillment modes is rejected (422 FULFILLMENT_REQUIRED)
    const disableAllFulfillmentRes = await app.request('/api/v1/admin/store-profile', {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({
        pickupEnabled: false,
        deliveryEnabled: false,
        dineInEnabled: false,
        expectedVersion: 3,
      }),
    });
    expect(disableAllFulfillmentRes.status).toBe(400);

    // 3. Dine-in requires tableNumber when dineInTableRequired is true (mobile optional, customerName required)
    const missingTableRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': 'phase3-dinein-no-table-123' },
      body: JSON.stringify({
        customerName: 'Ana',
        contactNumber: '',
        fulfillment: 'dine-in',
        tableNumber: '',
        addressOrNotes: '',
        paymentMethod: 'gcash',
        items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [], itemNote: '' }],
      }),
    });
    expect(missingTableRes.status).toBe(422);
    expect(((await missingTableRes.json()) as { code: string }).code).toBe('TABLE_NUMBER_REQUIRED');

    // Place dine-in GCash order without initial reference (starts unpaid, mobile optional)
    const dineInGcashRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': 'phase3-dinein-gcash-order-1' },
      body: JSON.stringify({
        customerName: 'Ana',
        contactNumber: '',
        fulfillment: 'dine-in',
        tableNumber: '7',
        addressOrNotes: '',
        paymentMethod: 'gcash',
        items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [], itemNote: '' }],
      }),
    });
    expect(dineInGcashRes.status).toBe(201);
    const dineInOrder = (await dineInGcashRes.json()) as {
      data: OrderRecord;
      receiptToken: string;
    };
    expect(dineInOrder.data.fulfillment).toBe('dine-in');
    expect(dineInOrder.data.tableNumber).toBe('7');
    expect(dineInOrder.data.paymentStatus).toBe('unpaid');
    expect(dineInOrder.data.paymentReference).toBe('');

    // Place a Cash order too so we verify Cash payment-status confirmation & payment-reference rejection
    const cashOrderRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': 'phase3-cash-order-12345678' },
      body: JSON.stringify({
        customerName: 'Ben',
        contactNumber: '',
        fulfillment: 'pickup',
        addressOrNotes: '',
        paymentMethod: 'cash',
        items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [], itemNote: '' }],
      }),
    });
    expect(cashOrderRes.status).toBe(201);
    const cashOrder = (await cashOrderRes.json()) as { data: OrderRecord; receiptToken: string };

    // 4. POST /orders/:id/payment-reference: rejects missing/wrong token (404), rejects Cash (422), supports initial + typo correction
    const unauthRefRes = await app.request(
      `/api/v1/orders/${dineInOrder.data.id}/payment-reference`,
      {
        method: 'POST',
        headers: CSRF_HEADERS,
        body: JSON.stringify({ paymentReference: 'GCASH-111' }),
      },
    );
    expect(unauthRefRes.status).toBe(404);

    const cashRefRes = await app.request(`/api/v1/orders/${cashOrder.data.id}/payment-reference`, {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'X-Order-Receipt-Token': cashOrder.receiptToken },
      body: JSON.stringify({ paymentReference: 'CASH-123' }),
    });
    expect(cashRefRes.status).toBe(422);
    expect(((await cashRefRes.json()) as { code: string }).code).toBe(
      'PAYMENT_REFERENCE_NOT_APPLICABLE',
    );

    const submitRefRes = await app.request(
      `/api/v1/orders/${dineInOrder.data.id}/payment-reference`,
      {
        method: 'POST',
        headers: { ...CSRF_HEADERS, 'X-Order-Receipt-Token': dineInOrder.receiptToken },
        body: JSON.stringify({ paymentReference: 'GCASH-TYPO-001' }),
      },
    );
    expect(submitRefRes.status).toBe(200);
    const submittedOrder = ((await submitRefRes.json()) as { data: OrderRecord }).data;
    expect(submittedOrder.paymentReference).toBe('GCASH-TYPO-001');
    expect(submittedOrder.paymentStatus).toBe('pending_verification');

    // Typo correction while pending_verification succeeds
    const fixRefRes = await app.request(`/api/v1/orders/${dineInOrder.data.id}/payment-reference`, {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'X-Order-Receipt-Token': dineInOrder.receiptToken },
      body: JSON.stringify({ paymentReference: 'GCASH-FIXED-999' }),
    });
    expect(fixRefRes.status).toBe(200);
    expect(((await fixRefRes.json()) as { data: OrderRecord }).data.paymentReference).toBe(
      'GCASH-FIXED-999',
    );

    // Public tracker exposes tableNumber and paymentStatus while strictly omitting paymentReference
    const trackerRes = await app.request(
      `/api/v1/orders/track/${encodeURIComponent(dineInOrder.data.queueNumber)}`,
    );
    expect(trackerRes.status).toBe(200);
    const trackerRaw = await trackerRes.text();
    expect(trackerRaw).not.toContain('GCASH-FIXED-999');
    expect(trackerRaw).not.toContain('paymentReference');
    const trackerData = (JSON.parse(trackerRaw) as { data: PublicOrderTracker }).data;
    expect(trackerData.tableNumber).toBe('7');
    expect(trackerData.paymentStatus).toBe('pending_verification');

    // 5. Self-cancellation is blocked once paymentStatus is pending_verification (both Tier 1 and Tier 2)
    const blockedCancelTier1 = await app.request(`/api/v1/orders/${dineInOrder.data.id}/cancel`, {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'X-Order-Receipt-Token': dineInOrder.receiptToken },
    });
    expect(blockedCancelTier1.status).toBe(409);
    expect(((await blockedCancelTier1.json()) as { code: string }).code).toBe(
      'ORDER_NOT_CANCELLABLE',
    );

    const blockedCancelTier2 = await app.request(
      `/api/v1/orders/track/${encodeURIComponent(dineInOrder.data.queueNumber)}/cancel`,
      {
        method: 'POST',
        headers: CSRF_HEADERS,
        body: JSON.stringify({ customerName: 'Ana' }),
      },
    );
    expect(blockedCancelTier2.status).toBe(409);

    // 6. Admin paymentStatus filter + pendingVerification count
    const pendingListRes = await app.request(
      '/api/v1/admin/orders?paymentStatus=pending_verification',
      { headers: { Cookie: 'mk_access_token=cashier-access-token' } },
    );
    expect(pendingListRes.status).toBe(200);
    const pendingList = (await pendingListRes.json()) as {
      data: OrderRecord[];
      counts: { pendingVerification: number; received: number };
    };
    expect(pendingList.data).toHaveLength(1);
    expect(pendingList.data[0]?.id).toBe(dineInOrder.data.id);
    expect(pendingList.counts.pendingVerification).toBe(1);

    // 7. PATCH /admin/orders/:id/payment-status: Staff forbidden (403), Cashier & Owner allowed (including Cash)
    const staffPayRes = await app.request(
      `/api/v1/admin/orders/${dineInOrder.data.id}/payment-status`,
      {
        method: 'PATCH',
        headers: staffHeaders,
        body: JSON.stringify({ paymentStatus: 'paid' }),
      },
    );
    expect(staffPayRes.status).toBe(403);
    expect(((await staffPayRes.json()) as { code: string }).code).toBe('INSUFFICIENT_ROLE');

    const cashierMarkPaid = await app.request(
      `/api/v1/admin/orders/${dineInOrder.data.id}/payment-status`,
      {
        method: 'PATCH',
        headers: cashierHeaders,
        body: JSON.stringify({ paymentStatus: 'paid', expectedVersion: 3 }),
      },
    );
    expect(cashierMarkPaid.status).toBe(200);
    const paidDineIn = ((await cashierMarkPaid.json()) as { data: OrderRecord }).data;
    expect(paidDineIn.paymentStatus).toBe('paid');
    expect(paidDineIn.status).toBe('received'); // kitchen status remains decoupled

    // Once paid, submitting a payment reference is rejected with 409 ORDER_ALREADY_PAID
    const postPaidRefRes = await app.request(
      `/api/v1/orders/${dineInOrder.data.id}/payment-reference`,
      {
        method: 'POST',
        headers: { ...CSRF_HEADERS, 'X-Order-Receipt-Token': dineInOrder.receiptToken },
        body: JSON.stringify({ paymentReference: 'LATE-EDIT' }),
      },
    );
    expect(postPaidRefRes.status).toBe(409);
    expect(((await postPaidRefRes.json()) as { code: string }).code).toBe('ORDER_ALREADY_PAID');

    // Cash order can also be marked paid by Cashier/Owner, and stale expectedVersion returns 409
    const markCashPaid = await app.request(
      `/api/v1/admin/orders/${cashOrder.data.id}/payment-status`,
      {
        method: 'PATCH',
        headers: ownerHeaders,
        body: JSON.stringify({ paymentStatus: 'paid', expectedVersion: 1 }),
      },
    );
    expect(markCashPaid.status).toBe(200);
    expect(((await markCashPaid.json()) as { data: OrderRecord }).data.paymentStatus).toBe('paid');

    const staleCashPay = await app.request(
      `/api/v1/admin/orders/${cashOrder.data.id}/payment-status`,
      {
        method: 'PATCH',
        headers: ownerHeaders,
        body: JSON.stringify({ paymentStatus: 'unpaid', expectedVersion: 1 }),
      },
    );
    expect(staleCashPay.status).toBe(409);
  });

  it('enforces Phase 4 security hardening: ENABLE_DEMO_RESET gate, dedicated receipt secret, per-account login throttling, neutral problem URI, and 500 log redaction', async () => {
    const { gateway } = createFakeGateway();
    const ownerCookieHeaders = {
      Origin: 'http://localhost:5173',
      'X-Requested-With': 'fetch',
      Cookie: 'mk_access_token=valid-access-token',
    };

    // 1. ENABLE_DEMO_RESET=false blocks both reset endpoints with 403 DEMO_RESET_DISABLED + neutral Problem Details URI
    const lockedApp = createApp({
      config: { ...TEST_CONFIG, enableDemoReset: false },
      gateway,
    });
    const blockedMenuReset = await lockedApp.request('/api/v1/admin/menu-items/reset', {
      method: 'POST',
      headers: ownerCookieHeaders,
    });
    expect(blockedMenuReset.status).toBe(403);
    const blockedMenuBody = (await blockedMenuReset.json()) as { code: string; type: string };
    expect(blockedMenuBody.code).toBe('DEMO_RESET_DISABLED');
    expect(blockedMenuBody.type).toBe('https://api.menu-kiosk.local/problems/demo_reset_disabled');

    const unlockedApp = createApp({
      config: { ...TEST_CONFIG, enableDemoReset: true },
      gateway,
    });
    const allowedMenuReset = await unlockedApp.request('/api/v1/admin/menu-items/reset', {
      method: 'POST',
      headers: ownerCookieHeaders,
    });
    expect(allowedMenuReset.status).toBe(200);

    // 2. Receipt tokens are derived from RECEIPT_SIGNING_SECRET, NOT SUPABASE_SERVICE_ROLE_KEY
    const orderBody = JSON.stringify({
      customerName: 'Marco',
      contactNumber: '',
      fulfillment: 'pickup',
      addressOrNotes: '',
      paymentMethod: 'cash',
      items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [], itemNote: '' }],
    });
    const appSecretA = createApp({
      config: { ...TEST_CONFIG, receiptSigningSecret: 'secret-alpha-0123456789-0123456789' },
      gateway: createFakeGateway().gateway,
    });
    const appSecretB = createApp({
      config: { ...TEST_CONFIG, receiptSigningSecret: 'secret-bravo-0123456789-0123456789' },
      gateway: createFakeGateway().gateway,
    });
    const resA = await appSecretA.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': 'receipt-secret-check-key-1234' },
      body: orderBody,
    });
    const resB = await appSecretB.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': 'receipt-secret-check-key-1234' },
      body: orderBody,
    });
    const tokenA = ((await resA.json()) as { receiptToken: string }).receiptToken;
    const tokenB = ((await resB.json()) as { receiptToken: string }).receiptToken;
    expect(tokenA).not.toBe(tokenB);

    // 3. Per-account login throttling blocks rotating X-Forwarded-For IPs targeting the same email when TRUST_PROXY=true
    const proxyApp = createApp({
      config: { ...TEST_CONFIG, trustProxy: true },
      gateway,
      loginRateLimiter: new SlidingWindowRateLimiter(1, 60_000),
    });
    const firstAttempt = await proxyApp.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'X-Forwarded-For': '203.0.113.10' },
      body: JSON.stringify({ email: 'owner@eightburgers.local', password: 'wrong' }),
    });
    expect(firstAttempt.status).toBe(401);

    const rotatingIpAttempt = await proxyApp.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'X-Forwarded-For': '203.0.113.11' },
      body: JSON.stringify({ email: 'OWNER@eightburgers.local', password: 'wrong' }),
    });
    expect(rotatingIpAttempt.status).toBe(429);
    expect(Number(rotatingIpAttempt.headers.get('retry-after'))).toBeGreaterThan(0);

    // 4. Unhandled 500 server error logs redact raw err.message
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const prodErrorApp = createApp({
        config: { ...TEST_CONFIG, nodeEnv: 'production' },
        gateway: createFakeGateway({
          getCatalog: async () => {
            throw new Error('SUPER_SECRET_DB_PASSWORD_LEAK');
          },
        }).gateway,
      });
      const errRes = await prodErrorApp.request('/api/v1/catalog');
      expect(errRes.status).toBe(500);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const loggedLine = String(consoleErrorSpy.mock.calls[0]?.[0] ?? '');
      expect(loggedLine).toContain('method=GET');
      expect(loggedLine).toContain('path=/api/v1/catalog');
      expect(loggedLine).toContain('name=Error');
      expect(loggedLine).not.toContain('SUPER_SECRET_DB_PASSWORD_LEAK');
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
