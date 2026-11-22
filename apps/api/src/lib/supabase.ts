import {
  DEFAULT_DELIVERY_ZONES,
  DEFAULT_FREE_DELIVERY_MIN_SUBTOTAL_PHP,
  DEFAULT_MENU_ITEMS,
  MENU_ADDONS,
  slugifyMenuId,
  slugifyZoneId,
  type AdminOrderCounts,
  type AdminOrderRange,
  type AdminOrderSort,
  type AdminOrderStatusFilter,
  type AdminUser,
  type CatalogPayload,
  type DeliveryPricingConfig,
  type DeliveryZone,
  type DeliveryZoneInput,
  type MenuAddon,
  type MenuAddonId,
  type MenuCategory,
  type MenuItem,
  type MenuItemInput,
  type OrderLineSnapshot,
  type OrderRecord,
  type OrderStatus,
  type PlaceOrderRequest,
} from '@eight-burgers/contracts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ApiConfig } from '../config/env';

export type MutationResult<T> =
  { status: 'ok'; data: T } | { status: 'not_found' } | { status: 'conflict'; latest: T };

export type PlaceOrderParams = {
  idempotencyKey: string;
  payloadHash: string;
  receiptTokenHash: string;
  request: PlaceOrderRequest;
};

export type PlaceOrderRpcResult =
  | { status: 'ok'; replayed: boolean; order: OrderRecord }
  | { status: 'item_unavailable'; itemId: string }
  | { status: 'price_changed'; latestTotalPhp: number }
  | { status: 'idempotency_conflict' }
  | { status: 'delivery_unavailable' }
  | { status: 'out_of_delivery_range' };

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
};

export type AuthSignInResult =
  | { status: 'ok'; user: AdminUser; tokens: AuthTokens }
  | { status: 'invalid_credentials' }
  | { status: 'forbidden' };

export type AuthRefreshResult = {
  user: AdminUser;
  tokens: AuthTokens;
};

export type AdminOrderCursor = {
  createdAt: string;
  id: string;
};

export type ListAdminOrdersParams = {
  status?: AdminOrderStatusFilter;
  q?: string;
  range?: AdminOrderRange;
  sort?: AdminOrderSort;
  limit: number;
  cursor?: AdminOrderCursor;
};

export type ListAdminOrdersResult = {
  orders: OrderRecord[];
  nextCursor: string | null;
  counts?: AdminOrderCounts;
};

export type ShopBackendGateway = {
  checkDatabaseReady: () => Promise<boolean>;
  getCatalog: () => Promise<CatalogPayload>;
  listMenuItems: (filters: {
    category?: MenuCategory;
    available?: boolean;
    q?: string;
  }) => Promise<MenuItem[]>;
  getDeliveryPricing: () => Promise<DeliveryPricingConfig>;
  placeOrder: (params: PlaceOrderParams) => Promise<PlaceOrderRpcResult>;
  getOrderByReceipt: (orderId: string, receiptTokenHash: string) => Promise<OrderRecord | null>;
  signInAdmin: (email: string, password: string) => Promise<AuthSignInResult>;
  verifyAccessToken: (accessToken: string) => Promise<AdminUser | null>;
  refreshAdminSession: (refreshToken: string) => Promise<AuthRefreshResult | null>;
  signOutAdmin: (accessToken: string) => Promise<void>;
  createMenuItem: (accessToken: string, input: MenuItemInput) => Promise<MenuItem>;
  updateMenuItem: (
    accessToken: string,
    id: string,
    input: MenuItemInput,
    expectedVersion?: number,
  ) => Promise<MutationResult<MenuItem>>;
  setMenuItemAvailability: (
    accessToken: string,
    id: string,
    available: boolean,
    expectedVersion?: number,
  ) => Promise<MutationResult<MenuItem>>;
  deleteMenuItem: (accessToken: string, id: string) => Promise<'deleted' | 'not_found'>;
  resetMenuCatalog: (accessToken: string) => Promise<MenuItem[]>;
  updateFreeDeliveryThreshold: (
    accessToken: string,
    minSubtotalPhp: number | null,
    expectedVersion?: number,
  ) => Promise<MutationResult<DeliveryPricingConfig>>;
  createDeliveryZone: (accessToken: string, input: DeliveryZoneInput) => Promise<DeliveryZone>;
  updateDeliveryZone: (
    accessToken: string,
    id: string,
    input: DeliveryZoneInput,
    expectedVersion?: number,
  ) => Promise<MutationResult<DeliveryZone>>;
  setDeliveryZoneEnabled: (
    accessToken: string,
    id: string,
    enabled: boolean,
    expectedVersion?: number,
  ) => Promise<MutationResult<DeliveryZone>>;
  deleteDeliveryZone: (accessToken: string, id: string) => Promise<'deleted' | 'not_found'>;
  resetDeliveryPricing: (accessToken: string) => Promise<DeliveryPricingConfig>;
  listAdminOrders: (
    accessToken: string,
    params: ListAdminOrdersParams,
  ) => Promise<ListAdminOrdersResult>;
  getAdminOrderById: (accessToken: string, orderId: string) => Promise<OrderRecord | null>;
  updateOrderStatus: (
    accessToken: string,
    orderId: string,
    status: OrderStatus,
    expectedVersion?: number,
  ) => Promise<MutationResult<OrderRecord>>;
};

type DbMenuItemRow = {
  id: string;
  name: string;
  category: MenuCategory;
  price_php: number;
  patty_spec: string;
  description: string;
  image_url: string;
  available: boolean;
  featured: boolean;
  allow_addons: boolean;
  sort_order: number;
  updated_at: string;
  version: number;
};

type DbMenuAddonRow = {
  id: MenuAddonId;
  name: string;
  price_php: number;
  sort_order: number;
};

type DbStoreSettingsRow = {
  id: number;
  free_delivery_min_subtotal_php: number | null;
  updated_at: string;
  version: number;
};

type DbDeliveryZoneRow = {
  id: string;
  name: string;
  areas: string;
  max_distance_km: number | string;
  fee_php: number;
  eta_minutes: string;
  enabled: boolean;
  updated_at: string;
  version: number;
};

type DbOrderLineRow = {
  line_id: string;
  item_id: string;
  name: string;
  unit_price_php: number;
  addon_names: string[] | null;
  addons_price_php: number;
  quantity: number;
  line_total_php: number;
  position: number;
};

type DbOrderRow = {
  id: string;
  queue_number: string;
  customer_name: string;
  contact_number: string;
  fulfillment: 'kiosk-pickup' | 'delivery';
  delivery_zone_id: string | null;
  delivery_zone_name: string | null;
  delivery_eta_minutes: string | null;
  delivery_pin_lat: number | null;
  delivery_pin_lng: number | null;
  delivery_distance_km: number | string | null;
  delivery_fee_waived: boolean;
  address_or_notes: string;
  payment_method: 'cash' | 'gcash' | 'maya';
  subtotal_php: number;
  delivery_fee_php: number;
  total_php: number;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
  version: number;
  order_lines?: DbOrderLineRow[];
};

type DbAdminUserRow = {
  user_id: string;
  email: string;
  role: 'owner' | 'staff';
  active: boolean;
};

const MENU_ITEM_COLUMNS =
  'id, name, category, price_php, patty_spec, description, image_url, available, featured, allow_addons, sort_order, updated_at, version';
const DELIVERY_ZONE_COLUMNS =
  'id, name, areas, max_distance_km, fee_php, eta_minutes, enabled, updated_at, version';
const ORDER_COLUMNS =
  'id, queue_number, customer_name, contact_number, fulfillment, delivery_zone_id, delivery_zone_name, delivery_eta_minutes, delivery_pin_lat, delivery_pin_lng, delivery_distance_km, delivery_fee_waived, address_or_notes, payment_method, subtotal_php, delivery_fee_php, total_php, status, created_at, updated_at, version, order_lines(line_id, item_id, name, unit_price_php, addon_names, addons_price_php, quantity, line_total_php, position)';

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function normalizeIsoTimestamp(raw: string): string {
  const parsedMs = Date.parse(raw);
  if (Number.isNaN(parsedMs)) return raw;
  return new Date(parsedMs).toISOString();
}

function resolveRangeStartIso(range?: AdminOrderRange, nowMs = Date.now()): string | null {
  if (!range || range === 'all') return null;
  if (range === '7d') {
    return new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  const manilaNow = new Date(nowMs + MANILA_OFFSET_MS);
  const manilaMidnightUtcMs =
    Date.UTC(manilaNow.getUTCFullYear(), manilaNow.getUTCMonth(), manilaNow.getUTCDate()) -
    MANILA_OFFSET_MS;
  return new Date(manilaMidnightUtcMs).toISOString();
}

function buildAdminOrdersSearchOrFilter(rawQuery?: string): string | null {
  if (!rawQuery) return null;
  const cleaned = rawQuery
    .trim()
    .replace(/[,()*\\"]/g, ' ')
    .replace(/[%_]/g, (char) => `\\${char}`)
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  const pattern = `"%${cleaned}%"`;
  return `queue_number.ilike.${pattern},customer_name.ilike.${pattern},contact_number.ilike.${pattern},delivery_zone_name.ilike.${pattern}`;
}

function mapMenuItem(row: DbMenuItemRow): MenuItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    pricePhp: row.price_php,
    pattySpec: row.patty_spec,
    description: row.description,
    imageUrl: row.image_url,
    available: row.available,
    featured: row.featured,
    allowAddons: row.allow_addons,
    updatedAt: normalizeIsoTimestamp(row.updated_at),
    version: row.version,
  };
}

function mapAddon(row: DbMenuAddonRow): MenuAddon {
  return {
    id: row.id,
    name: row.name,
    pricePhp: row.price_php,
  };
}

function mapZone(row: DbDeliveryZoneRow): DeliveryZone {
  return {
    id: row.id,
    name: row.name,
    areas: row.areas,
    maxDistanceKm: Number(row.max_distance_km),
    feePhp: row.fee_php,
    etaMinutes: row.eta_minutes,
    enabled: row.enabled,
    updatedAt: normalizeIsoTimestamp(row.updated_at),
    version: row.version,
  };
}

function mapOrder(row: DbOrderRow): OrderRecord {
  const lines: OrderLineSnapshot[] = [...(row.order_lines ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((line) => ({
      lineId: line.line_id,
      itemId: line.item_id,
      name: line.name,
      unitPricePhp: line.unit_price_php,
      addonNames: line.addon_names ?? [],
      addonsPricePhp: line.addons_price_php,
      quantity: line.quantity,
      lineTotalPhp: line.line_total_php,
    }));

  return {
    id: row.id,
    queueNumber: row.queue_number,
    customerName: row.customer_name,
    contactNumber: row.contact_number,
    fulfillment: row.fulfillment,
    ...(row.delivery_zone_id ? { deliveryZoneId: row.delivery_zone_id } : {}),
    ...(row.delivery_zone_name ? { deliveryZoneName: row.delivery_zone_name } : {}),
    ...(row.delivery_eta_minutes ? { deliveryEtaMinutes: row.delivery_eta_minutes } : {}),
    ...(row.delivery_pin_lat !== null && row.delivery_pin_lng !== null
      ? { deliveryPin: { lat: row.delivery_pin_lat, lng: row.delivery_pin_lng } }
      : {}),
    ...(row.delivery_distance_km !== null
      ? { deliveryDistanceKm: Number(row.delivery_distance_km) }
      : {}),
    ...(row.delivery_fee_waived ? { deliveryFeeWaived: true } : {}),
    addressOrNotes: row.address_or_notes,
    paymentMethod: row.payment_method,
    lines,
    subtotalPhp: row.subtotal_php,
    deliveryFeePhp: row.delivery_fee_php,
    totalPhp: row.total_php,
    status: row.status,
    createdAtIso: normalizeIsoTimestamp(row.created_at),
    updatedAt: normalizeIsoTimestamp(row.updated_at),
    version: row.version,
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createSupabaseGateway(config: ApiConfig): ShopBackendGateway {
  const clientOptions = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };

  const anonClient = createClient(config.supabaseUrl, config.supabaseAnonKey, clientOptions);
  const serviceClient = createClient(
    config.supabaseUrl,
    config.supabaseServiceRoleKey,
    clientOptions,
  );

  function createAuthClient(): SupabaseClient {
    return createClient(config.supabaseUrl, config.supabaseAnonKey, clientOptions);
  }

  function createUserRlsClient(accessToken: string): SupabaseClient {
    return createClient(config.supabaseUrl, config.supabaseAnonKey, {
      ...clientOptions,
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  }

  async function lookupActiveAdmin(userId: string): Promise<AdminUser | null> {
    const { data, error } = await serviceClient
      .from('admin_users')
      .select('user_id, email, role, active')
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle<DbAdminUserRow>();

    if (error || !data) {
      return null;
    }

    return {
      id: data.user_id,
      email: data.email,
      role: data.role,
    };
  }

  async function fetchDeliveryPricingWithClient(
    client: SupabaseClient,
  ): Promise<DeliveryPricingConfig> {
    const [settingsRes, zonesRes] = await Promise.all([
      client
        .from('store_settings')
        .select('id, free_delivery_min_subtotal_php, updated_at, version')
        .eq('id', 1)
        .maybeSingle<DbStoreSettingsRow>(),
      client
        .from('delivery_zones')
        .select(DELIVERY_ZONE_COLUMNS)
        .order('max_distance_km', { ascending: true })
        .returns<DbDeliveryZoneRow[]>(),
    ]);

    if (settingsRes.error) throw settingsRes.error;
    if (zonesRes.error) throw zonesRes.error;

    return {
      zones: (zonesRes.data ?? []).map(mapZone),
      freeDeliveryMinSubtotalPhp: settingsRes.data
        ? settingsRes.data.free_delivery_min_subtotal_php
        : DEFAULT_FREE_DELIVERY_MIN_SUBTOTAL_PHP,
      ...(settingsRes.data?.updated_at
        ? { updatedAt: normalizeIsoTimestamp(settingsRes.data.updated_at) }
        : {}),
      ...(settingsRes.data?.version !== undefined ? { version: settingsRes.data.version } : {}),
    };
  }

  return {
    async checkDatabaseReady() {
      const { error } = await serviceClient.from('store_settings').select('id').limit(1);
      return !error;
    },

    async getCatalog() {
      const [menuRes, addonsRes, deliveryPricing] = await Promise.all([
        anonClient
          .from('menu_items')
          .select(MENU_ITEM_COLUMNS)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false })
          .returns<DbMenuItemRow[]>(),
        anonClient
          .from('menu_addons')
          .select('id, name, price_php, sort_order')
          .order('sort_order', { ascending: true })
          .returns<DbMenuAddonRow[]>(),
        fetchDeliveryPricingWithClient(anonClient),
      ]);

      if (menuRes.error) throw menuRes.error;
      if (addonsRes.error) throw addonsRes.error;

      return {
        menu: (menuRes.data ?? []).map(mapMenuItem),
        addons:
          addonsRes.data && addonsRes.data.length > 0
            ? addonsRes.data.map(mapAddon)
            : [...MENU_ADDONS],
        deliveryPricing,
      };
    },

    async listMenuItems(filters) {
      let query = anonClient
        .from('menu_items')
        .select(MENU_ITEM_COLUMNS)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      if (typeof filters.available === 'boolean') {
        query = query.eq('available', filters.available);
      }

      const { data, error } = await query.returns<DbMenuItemRow[]>();
      if (error) throw error;

      let items = (data ?? []).map(mapMenuItem);
      if (filters.q) {
        const needle = filters.q.trim().toLowerCase();
        items = items.filter(
          (item) =>
            item.name.toLowerCase().includes(needle) ||
            item.description.toLowerCase().includes(needle) ||
            item.pattySpec.toLowerCase().includes(needle),
        );
      }
      return items;
    },

    async getDeliveryPricing() {
      return fetchDeliveryPricingWithClient(anonClient);
    },

    async placeOrder({ idempotencyKey, payloadHash, receiptTokenHash, request }) {
      const { data, error } = await serviceClient.rpc('place_order', {
        p_idempotency_key: idempotencyKey,
        p_payload_hash: payloadHash,
        p_receipt_token_hash: receiptTokenHash,
        p_customer_name: request.customerName,
        p_contact_number: request.contactNumber,
        p_fulfillment: request.fulfillment,
        p_delivery_zone_id:
          request.fulfillment === 'delivery' ? (request.deliveryZoneId ?? null) : null,
        p_delivery_pin_lat:
          request.fulfillment === 'delivery' && request.deliveryPin
            ? request.deliveryPin.lat
            : null,
        p_delivery_pin_lng:
          request.fulfillment === 'delivery' && request.deliveryPin
            ? request.deliveryPin.lng
            : null,
        p_address_or_notes: request.addressOrNotes,
        p_payment_method: request.paymentMethod,
        p_items: request.items,
        p_expected_total_php: request.expectedTotalPhp ?? null,
      });

      if (error) {
        const msg = error.message ?? '';
        if (msg.startsWith('ITEM_UNAVAILABLE:')) {
          return { status: 'item_unavailable', itemId: msg.slice('ITEM_UNAVAILABLE:'.length) };
        }
        if (msg.startsWith('PRICE_CHANGED:')) {
          const parsedTotal = Number(msg.slice('PRICE_CHANGED:'.length));
          return {
            status: 'price_changed',
            latestTotalPhp: Number.isFinite(parsedTotal) ? parsedTotal : 0,
          };
        }
        if (msg.includes('IDEMPOTENCY_CONFLICT')) {
          return { status: 'idempotency_conflict' };
        }
        if (msg.includes('DELIVERY_UNAVAILABLE')) {
          return { status: 'delivery_unavailable' };
        }
        if (msg.includes('OUT_OF_DELIVERY_RANGE')) {
          return { status: 'out_of_delivery_range' };
        }
        throw error;
      }

      const payload = data as { replayed: boolean; order: OrderRecord } | null;
      if (!payload || !payload.order) {
        throw new Error('Unexpected empty response from place_order RPC.');
      }

      return {
        status: 'ok',
        replayed: Boolean(payload.replayed),
        order: payload.order,
      };
    },

    async getOrderByReceipt(orderId, receiptTokenHash) {
      if (!UUID_REGEX.test(orderId)) {
        return null;
      }
      const { data, error } = await serviceClient.rpc('get_order_by_receipt', {
        p_order_id: orderId,
        p_receipt_token_hash: receiptTokenHash,
      });
      if (error) throw error;
      return (data as OrderRecord | null) ?? null;
    },

    async signInAdmin(email, password) {
      const authClient = createAuthClient();
      const { data, error } = await authClient.auth.signInWithPassword({ email, password });
      if (error || !data.session || !data.user) {
        return { status: 'invalid_credentials' };
      }

      const adminUser = await lookupActiveAdmin(data.user.id);
      if (!adminUser) {
        return { status: 'forbidden' };
      }

      return {
        status: 'ok',
        user: adminUser,
        tokens: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresInSeconds: data.session.expires_in ?? 3600,
        },
      };
    },

    async verifyAccessToken(accessToken) {
      const authClient = createAuthClient();
      const { data, error } = await authClient.auth.getUser(accessToken);
      if (error || !data.user) {
        return null;
      }
      return lookupActiveAdmin(data.user.id);
    },

    async refreshAdminSession(refreshToken) {
      const authClient = createAuthClient();
      const { data, error } = await authClient.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session || !data.user) {
        return null;
      }

      const adminUser = await lookupActiveAdmin(data.user.id);
      if (!adminUser) {
        return null;
      }

      return {
        user: adminUser,
        tokens: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresInSeconds: data.session.expires_in ?? 3600,
        },
      };
    },

    async signOutAdmin(accessToken) {
      const userClient = createUserRlsClient(accessToken);
      await userClient.auth.signOut({ scope: 'local' }).catch(() => undefined);
    },

    async createMenuItem(accessToken, input) {
      const client = createUserRlsClient(accessToken);
      const { data: existingRows, error: idsError } = await client
        .from('menu_items')
        .select('id')
        .returns<{ id: string }[]>();
      if (idsError) throw idsError;

      const existingIds = new Set((existingRows ?? []).map((row) => row.id));
      const id = slugifyMenuId(input.name, existingIds);

      const { data, error } = await client
        .from('menu_items')
        .insert({
          id,
          name: input.name,
          category: input.category,
          price_php: input.pricePhp,
          patty_spec: input.pattySpec,
          description: input.description,
          image_url: input.imageUrl,
          available: input.available,
          featured: input.featured,
          allow_addons: input.allowAddons,
          sort_order: 0,
        })
        .select(MENU_ITEM_COLUMNS)
        .single<DbMenuItemRow>();

      if (error) throw error;
      return mapMenuItem(data);
    },

    async updateMenuItem(accessToken, id, input, expectedVersion) {
      const client = createUserRlsClient(accessToken);
      let updateQuery = client
        .from('menu_items')
        .update({
          name: input.name,
          category: input.category,
          price_php: input.pricePhp,
          patty_spec: input.pattySpec,
          description: input.description,
          image_url: input.imageUrl,
          available: input.available,
          featured: input.featured,
          allow_addons: input.allowAddons,
        })
        .eq('id', id);

      if (expectedVersion !== undefined) {
        updateQuery = updateQuery.eq('version', expectedVersion);
      }

      const { data, error } = await updateQuery
        .select(MENU_ITEM_COLUMNS)
        .maybeSingle<DbMenuItemRow>();
      if (error) throw error;
      if (data) return { status: 'ok', data: mapMenuItem(data) };

      const { data: current, error: fetchError } = await client
        .from('menu_items')
        .select(MENU_ITEM_COLUMNS)
        .eq('id', id)
        .maybeSingle<DbMenuItemRow>();
      if (fetchError) throw fetchError;
      if (!current) return { status: 'not_found' };
      return { status: 'conflict', latest: mapMenuItem(current) };
    },

    async setMenuItemAvailability(accessToken, id, available, expectedVersion) {
      const client = createUserRlsClient(accessToken);
      let updateQuery = client.from('menu_items').update({ available }).eq('id', id);

      if (expectedVersion !== undefined) {
        updateQuery = updateQuery.eq('version', expectedVersion);
      }

      const { data, error } = await updateQuery
        .select(MENU_ITEM_COLUMNS)
        .maybeSingle<DbMenuItemRow>();
      if (error) throw error;
      if (data) return { status: 'ok', data: mapMenuItem(data) };

      const { data: current, error: fetchError } = await client
        .from('menu_items')
        .select(MENU_ITEM_COLUMNS)
        .eq('id', id)
        .maybeSingle<DbMenuItemRow>();
      if (fetchError) throw fetchError;
      if (!current) return { status: 'not_found' };
      return { status: 'conflict', latest: mapMenuItem(current) };
    },

    async deleteMenuItem(accessToken, id) {
      const client = createUserRlsClient(accessToken);
      const { data, error } = await client
        .from('menu_items')
        .delete()
        .eq('id', id)
        .select('id')
        .returns<{ id: string }[]>();
      if (error) throw error;
      return data && data.length > 0 ? 'deleted' : 'not_found';
    },

    async resetMenuCatalog(accessToken) {
      const client = createUserRlsClient(accessToken);
      const { error: deleteError } = await client.from('menu_items').delete().neq('id', '');
      if (deleteError) throw deleteError;

      const seedRows = DEFAULT_MENU_ITEMS.map((item, idx) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        price_php: item.pricePhp,
        patty_spec: item.pattySpec,
        description: item.description,
        image_url: item.imageUrl,
        available: item.available,
        featured: item.featured,
        allow_addons: item.allowAddons,
        sort_order: idx + 1,
      }));

      const { data, error } = await client
        .from('menu_items')
        .insert(seedRows)
        .select(MENU_ITEM_COLUMNS)
        .order('sort_order', { ascending: true })
        .returns<DbMenuItemRow[]>();
      if (error) throw error;
      return (data ?? []).map(mapMenuItem);
    },

    async updateFreeDeliveryThreshold(accessToken, minSubtotalPhp, expectedVersion) {
      const client = createUserRlsClient(accessToken);
      if (expectedVersion !== undefined) {
        const { data, error } = await client
          .from('store_settings')
          .update({ free_delivery_min_subtotal_php: minSubtotalPhp })
          .eq('id', 1)
          .eq('version', expectedVersion)
          .select('id, free_delivery_min_subtotal_php, updated_at, version')
          .maybeSingle<DbStoreSettingsRow>();
        if (error) throw error;
        if (!data) {
          const current = await fetchDeliveryPricingWithClient(client);
          if (current.version === undefined) return { status: 'not_found' };
          return { status: 'conflict', latest: current };
        }
      } else {
        const { error } = await client
          .from('store_settings')
          .upsert({ id: 1, free_delivery_min_subtotal_php: minSubtotalPhp });
        if (error) throw error;
      }

      const updated = await fetchDeliveryPricingWithClient(client);
      return { status: 'ok', data: updated };
    },

    async createDeliveryZone(accessToken, input) {
      const client = createUserRlsClient(accessToken);
      const { data: existingRows, error: idsError } = await client
        .from('delivery_zones')
        .select('id')
        .returns<{ id: string }[]>();
      if (idsError) throw idsError;

      const existingIds = new Set((existingRows ?? []).map((row) => row.id));
      const id = slugifyZoneId(input.name, existingIds);

      const { data, error } = await client
        .from('delivery_zones')
        .insert({
          id,
          name: input.name,
          areas: input.areas,
          max_distance_km: input.maxDistanceKm,
          fee_php: input.feePhp,
          eta_minutes: input.etaMinutes,
          enabled: input.enabled,
        })
        .select(DELIVERY_ZONE_COLUMNS)
        .single<DbDeliveryZoneRow>();
      if (error) throw error;
      return mapZone(data);
    },

    async updateDeliveryZone(accessToken, id, input, expectedVersion) {
      const client = createUserRlsClient(accessToken);
      let updateQuery = client
        .from('delivery_zones')
        .update({
          name: input.name,
          areas: input.areas,
          max_distance_km: input.maxDistanceKm,
          fee_php: input.feePhp,
          eta_minutes: input.etaMinutes,
          enabled: input.enabled,
        })
        .eq('id', id);

      if (expectedVersion !== undefined) {
        updateQuery = updateQuery.eq('version', expectedVersion);
      }

      const { data, error } = await updateQuery
        .select(DELIVERY_ZONE_COLUMNS)
        .maybeSingle<DbDeliveryZoneRow>();
      if (error) throw error;
      if (data) return { status: 'ok', data: mapZone(data) };

      const { data: current, error: fetchError } = await client
        .from('delivery_zones')
        .select(DELIVERY_ZONE_COLUMNS)
        .eq('id', id)
        .maybeSingle<DbDeliveryZoneRow>();
      if (fetchError) throw fetchError;
      if (!current) return { status: 'not_found' };
      return { status: 'conflict', latest: mapZone(current) };
    },

    async setDeliveryZoneEnabled(accessToken, id, enabled, expectedVersion) {
      const client = createUserRlsClient(accessToken);
      let updateQuery = client.from('delivery_zones').update({ enabled }).eq('id', id);

      if (expectedVersion !== undefined) {
        updateQuery = updateQuery.eq('version', expectedVersion);
      }

      const { data, error } = await updateQuery
        .select(DELIVERY_ZONE_COLUMNS)
        .maybeSingle<DbDeliveryZoneRow>();
      if (error) throw error;
      if (data) return { status: 'ok', data: mapZone(data) };

      const { data: current, error: fetchError } = await client
        .from('delivery_zones')
        .select(DELIVERY_ZONE_COLUMNS)
        .eq('id', id)
        .maybeSingle<DbDeliveryZoneRow>();
      if (fetchError) throw fetchError;
      if (!current) return { status: 'not_found' };
      return { status: 'conflict', latest: mapZone(current) };
    },

    async deleteDeliveryZone(accessToken, id) {
      const client = createUserRlsClient(accessToken);
      const { data, error } = await client
        .from('delivery_zones')
        .delete()
        .eq('id', id)
        .select('id')
        .returns<{ id: string }[]>();
      if (error) throw error;
      return data && data.length > 0 ? 'deleted' : 'not_found';
    },

    async resetDeliveryPricing(accessToken) {
      const client = createUserRlsClient(accessToken);
      const { error: deleteError } = await client.from('delivery_zones').delete().neq('id', '');
      if (deleteError) throw deleteError;

      const { error: insertError } = await client.from('delivery_zones').insert(
        DEFAULT_DELIVERY_ZONES.map((zone) => ({
          id: zone.id,
          name: zone.name,
          areas: zone.areas,
          max_distance_km: zone.maxDistanceKm,
          fee_php: zone.feePhp,
          eta_minutes: zone.etaMinutes,
          enabled: zone.enabled,
        })),
      );
      if (insertError) throw insertError;

      const { error: settingsError } = await client
        .from('store_settings')
        .upsert({ id: 1, free_delivery_min_subtotal_php: DEFAULT_FREE_DELIVERY_MIN_SUBTOTAL_PHP });
      if (settingsError) throw settingsError;

      return fetchDeliveryPricingWithClient(client);
    },

    async listAdminOrders(accessToken, params) {
      const client = createUserRlsClient(accessToken);
      const ascending = params.sort === 'asc';
      const rangeStartIso = resolveRangeStartIso(params.range);
      const searchFilter = buildAdminOrdersSearchOrFilter(params.q);

      let query = client
        .from('orders')
        .select(ORDER_COLUMNS)
        .order('created_at', { ascending })
        .order('id', { ascending })
        .limit(params.limit + 1);

      if (params.status === 'active') {
        query = query.in('status', ['received', 'grilling', 'ready']);
      } else if (params.status && params.status !== 'all') {
        query = query.eq('status', params.status);
      }

      if (rangeStartIso) {
        query = query.gte('created_at', rangeStartIso);
      }

      if (searchFilter) {
        query = query.or(searchFilter);
      }

      if (params.cursor) {
        const op = ascending ? 'gt' : 'lt';
        const ts = normalizeIsoTimestamp(params.cursor.createdAt);
        const id = params.cursor.id;
        query = query.or(`created_at.${op}.${ts},and(created_at.eq.${ts},id.${op}.${id})`);
      }

      const fetchStageCount = async (stage: OrderStatus): Promise<number> => {
        let countQuery = client
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', stage);
        if (rangeStartIso) {
          countQuery = countQuery.gte('created_at', rangeStartIso);
        }
        if (searchFilter) {
          countQuery = countQuery.or(searchFilter);
        }
        const { count, error: countError } = await countQuery;
        if (countError) throw countError;
        return count ?? 0;
      };

      const [rowsRes, counts] = await Promise.all([
        query.returns<DbOrderRow[]>(),
        params.cursor
          ? Promise.resolve(undefined)
          : Promise.all([
              fetchStageCount('received'),
              fetchStageCount('grilling'),
              fetchStageCount('ready'),
              fetchStageCount('completed'),
            ]).then(([received, grilling, ready, completed]): AdminOrderCounts => ({
              all: received + grilling + ready + completed,
              active: received + grilling + ready,
              received,
              grilling,
              ready,
              completed,
            })),
      ]);

      if (rowsRes.error) throw rowsRes.error;

      const rows = rowsRes.data ?? [];
      const hasMore = rows.length > params.limit;
      const sliced = hasMore ? rows.slice(0, params.limit) : rows;
      const lastRow = sliced[sliced.length - 1];
      const nextCursor =
        hasMore && lastRow ? `${normalizeIsoTimestamp(lastRow.created_at)}|${lastRow.id}` : null;

      return {
        orders: sliced.map(mapOrder),
        nextCursor,
        ...(counts ? { counts } : {}),
      };
    },

    async getAdminOrderById(accessToken, orderId) {
      if (!UUID_REGEX.test(orderId)) return null;
      const client = createUserRlsClient(accessToken);
      const { data, error } = await client
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('id', orderId)
        .maybeSingle<DbOrderRow>();
      if (error) throw error;
      return data ? mapOrder(data) : null;
    },

    async updateOrderStatus(accessToken, orderId, status, expectedVersion) {
      if (!UUID_REGEX.test(orderId)) return { status: 'not_found' };
      const client = createUserRlsClient(accessToken);
      let updateQuery = client.from('orders').update({ status }).eq('id', orderId);

      if (expectedVersion !== undefined) {
        updateQuery = updateQuery.eq('version', expectedVersion);
      }

      const { data, error } = await updateQuery.select(ORDER_COLUMNS).maybeSingle<DbOrderRow>();
      if (error) throw error;
      if (data) return { status: 'ok', data: mapOrder(data) };

      const current = await this.getAdminOrderById(accessToken, orderId);
      if (!current) return { status: 'not_found' };
      return { status: 'conflict', latest: current };
    },
  };
}
