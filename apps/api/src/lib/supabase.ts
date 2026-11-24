import { randomUUID } from 'node:crypto';
import {
  DEFAULT_DELIVERY_BASE_FEE_PHP,
  DEFAULT_DELIVERY_ENABLED,
  DEFAULT_DELIVERY_MAX_DISTANCE_KM,
  DEFAULT_DELIVERY_PER_KM_RATE_PHP,
  DEFAULT_FREE_DELIVERY_MIN_SUBTOTAL_PHP,
  DEFAULT_MENU_CATEGORIES,
  DEFAULT_MENU_ITEMS,
  DEFAULT_OPTION_GROUPS,
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_STORE_PROFILE,
  externalLinkSchema,
  paymentMethodsConfigSchema,
  selectedOptionSnapshotSchema,
  slugifyCategoryId,
  slugifyMenuId,
  slugifyOptionChoiceId,
  slugifyOptionGroupId,
  type AdminOrderCounts,
  type AdminOrderPaymentFilter,
  type AdminOrderRange,
  type AdminOrderSort,
  type AdminOrderStatusFilter,
  type AdminRole,
  type AdminTeamMember,
  type AdminUser,
  type CancelPublicOrderByQueueRequest,
  type CatalogPayload,
  type CreateAdminUserRequest,
  type DeliveryPricingConfig,
  type DeliveryPricingPatch,
  type ExternalLink,
  type FulfillmentMode,
  type GeoCoordinates,
  type MenuCategory,
  type MenuCategoryInput,
  type MenuCategoryPatch,
  type MenuItem,
  type MenuItemMutationInput,
  type OptionChoice,
  type OptionGroup,
  type OptionGroupInput,
  type OptionGroupPatch,
  type OptionSelectionMode,
  type OrderLineSnapshot,
  type OrderRecord,
  type OrderStatus,
  type PaymentMethod,
  type PaymentMethodsConfig,
  type PaymentStatus,
  type PlaceOrderRequest,
  type PublicOrderTracker,
  type SelectedOptionSnapshot,
  type SlugId,
  type StoreAssetUploadPurpose,
  type StoreOrderingStatusPatch,
  type StoreProfile,
  type StoreProfilePatch,
  type StoreThemePreset,
  type UpdateAdminUserRequest,
} from '@menu-kiosk/contracts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ApiConfig } from '../config/env';
import {
  MENU_IMAGES_BUCKET,
  buildManagedImageUrlVariants,
  buildMenuImagePublicUrl,
  extractManagedMenuImagePath,
  extractPaymentMethodQrUrls,
  getManagedAssetFolder,
  resolveUnreferencedManagedPaths,
} from './menu-images';

export type MutationResult<T> =
  { status: 'ok'; data: T } | { status: 'not_found' } | { status: 'conflict'; latest: T };

export type UpdateStoreProfileResult =
  | MutationResult<StoreProfile>
  | { status: 'origin_required_for_delivery' }
  | { status: 'fulfillment_required' };

export type UpdateDeliveryPricingResult =
  | MutationResult<DeliveryPricingConfig>
  | { status: 'origin_required_for_delivery' }
  | { status: 'fulfillment_required' };

export type CreateMenuCategoryResult =
  { status: 'ok'; data: MenuCategory } | { status: 'conflict_slug' };

export type CreateOptionGroupResult =
  { status: 'ok'; data: OptionGroup } | { status: 'conflict_slug' };

export type UpdateOptionGroupResult =
  | MutationResult<OptionGroup>
  | { status: 'conflict_slug' }
  | { status: 'validation_error'; field: string; message: string };

export type CreateMenuItemResult =
  | { status: 'ok'; data: MenuItem }
  | { status: 'conflict_slug' }
  | { status: 'invalid_reference'; detail: string };

export type UpdateMenuItemResult =
  MutationResult<MenuItem> | { status: 'invalid_reference'; detail: string };

export type PlaceOrderParams = {
  idempotencyKey: string;
  payloadHash: string;
  receiptTokenHash: string;
  request: PlaceOrderRequest;
};

export type PlaceOrderRpcResult =
  | { status: 'ok'; replayed: boolean; order: OrderRecord }
  | { status: 'store_closed'; closedNotice?: string }
  | { status: 'customer_name_required' }
  | { status: 'fulfillment_unavailable' }
  | { status: 'table_number_required' }
  | { status: 'invalid_table_number' }
  | { status: 'payment_method_unavailable' }
  | { status: 'payment_reference_required' }
  | { status: 'invalid_payment_reference' }
  | { status: 'item_unavailable'; itemId: string }
  | { status: 'invalid_option_selection'; optionId?: string }
  | { status: 'option_unavailable'; optionId?: string }
  | { status: 'required_option_missing'; groupId?: string }
  | { status: 'option_limit_exceeded'; groupId?: string }
  | { status: 'price_changed'; latestTotalPhp: number }
  | { status: 'idempotency_conflict' }
  | { status: 'delivery_unavailable' }
  | { status: 'delivery_pin_required' }
  | { status: 'out_of_delivery_range' };

export type SubmitPaymentReferenceResult =
  | { status: 'ok'; order: OrderRecord }
  | { status: 'not_found' }
  | { status: 'invalid_reference'; order: OrderRecord }
  | { status: 'cash_not_applicable'; order: OrderRecord }
  | { status: 'order_cancelled'; order: OrderRecord }
  | { status: 'already_paid'; order: OrderRecord };

export type CancelOrderByReceiptResult =
  | { status: 'ok'; order: OrderRecord }
  | { status: 'not_found' }
  | { status: 'not_cancellable'; order: OrderRecord };

export type CancelPublicOrderByQueueResult =
  | { status: 'ok'; tracker: PublicOrderTracker }
  | { status: 'not_found' }
  | { status: 'verification_failed' }
  | { status: 'not_cancellable'; tracker: PublicOrderTracker };

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
  paymentStatus?: AdminOrderPaymentFilter;
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

export type CreateAdminUserResult =
  { status: 'ok'; member: AdminTeamMember } | { status: 'email_exists' };

export type UpdateAdminUserResult =
  { status: 'ok'; member: AdminTeamMember } | { status: 'not_found' } | { status: 'last_owner' };

export type ShopBackendGateway = {
  checkDatabaseReady: () => Promise<boolean>;
  getCatalog: () => Promise<CatalogPayload>;
  getStoreProfile: () => Promise<StoreProfile>;
  listMenuItems: (filters: {
    category?: SlugId;
    available?: boolean;
    q?: string;
  }) => Promise<MenuItem[]>;
  listMenuCategories: (accessToken: string) => Promise<MenuCategory[]>;
  createMenuCategory: (
    accessToken: string,
    input: Omit<MenuCategoryInput, 'expectedVersion'>,
  ) => Promise<CreateMenuCategoryResult>;
  updateMenuCategory: (
    accessToken: string,
    id: string,
    patch: Omit<MenuCategoryPatch, 'expectedVersion'>,
    expectedVersion?: number,
  ) => Promise<MutationResult<MenuCategory>>;
  reorderMenuCategories: (
    accessToken: string,
    orderedIds: readonly string[],
  ) => Promise<MenuCategory[]>;
  deleteMenuCategory: (
    accessToken: string,
    id: string,
  ) => Promise<'deleted' | 'not_found' | 'in_use'>;
  listOptionGroups: (accessToken: string) => Promise<OptionGroup[]>;
  createOptionGroup: (
    accessToken: string,
    input: Omit<OptionGroupInput, 'expectedVersion'>,
  ) => Promise<CreateOptionGroupResult>;
  updateOptionGroup: (
    accessToken: string,
    id: string,
    patch: Omit<OptionGroupPatch, 'expectedVersion'>,
    expectedVersion?: number,
  ) => Promise<UpdateOptionGroupResult>;
  reorderOptionGroups: (
    accessToken: string,
    orderedIds: readonly string[],
  ) => Promise<OptionGroup[]>;
  deleteOptionGroup: (
    accessToken: string,
    id: string,
  ) => Promise<'deleted' | 'not_found' | 'in_use'>;
  setOptionChoiceAvailability: (
    accessToken: string,
    id: string,
    available: boolean,
    expectedVersion?: number,
  ) => Promise<MutationResult<OptionChoice>>;
  getDeliveryPricing: () => Promise<DeliveryPricingConfig>;
  placeOrder: (params: PlaceOrderParams) => Promise<PlaceOrderRpcResult>;
  getOrderByReceipt: (orderId: string, receiptTokenHash: string) => Promise<OrderRecord | null>;
  cancelOrderByReceipt: (
    orderId: string,
    receiptTokenHash: string,
  ) => Promise<CancelOrderByReceiptResult>;
  submitPaymentReferenceByReceipt: (
    orderId: string,
    receiptTokenHash: string,
    paymentReference: string,
  ) => Promise<SubmitPaymentReferenceResult>;
  getPublicOrderStatusByQueue: (queueNumber: string) => Promise<PublicOrderTracker | null>;
  cancelPublicOrderByQueue: (
    queueNumber: string,
    verification: CancelPublicOrderByQueueRequest,
  ) => Promise<CancelPublicOrderByQueueResult>;
  signInAdmin: (email: string, password: string) => Promise<AuthSignInResult>;
  verifyAccessToken: (accessToken: string) => Promise<AdminUser | null>;
  refreshAdminSession: (refreshToken: string) => Promise<AuthRefreshResult | null>;
  signOutAdmin: (accessToken: string) => Promise<boolean>;
  createMenuItem: (
    accessToken: string,
    input: Omit<MenuItemMutationInput, 'expectedVersion'>,
  ) => Promise<CreateMenuItemResult>;
  updateMenuItem: (
    accessToken: string,
    id: string,
    input: Omit<MenuItemMutationInput, 'expectedVersion'>,
    expectedVersion?: number,
  ) => Promise<UpdateMenuItemResult>;
  setMenuItemAvailability: (
    accessToken: string,
    id: string,
    available: boolean,
    expectedVersion?: number,
  ) => Promise<MutationResult<MenuItem>>;
  deleteMenuItem: (accessToken: string, id: string) => Promise<'deleted' | 'not_found'>;
  resetMenuCatalog: (accessToken: string) => Promise<MenuItem[]>;
  uploadMenuImage: (
    accessToken: string,
    file: { buffer: Uint8Array; contentType: 'image/webp' },
  ) => Promise<{ path: string; imageUrl: string }>;
  deleteUnusedMenuImage: (accessToken: string, imageUrl: string) => Promise<'deleted' | 'ignored'>;
  uploadStoreAsset: (
    accessToken: string,
    file: { buffer: Uint8Array; contentType: 'image/webp'; purpose: StoreAssetUploadPurpose },
  ) => Promise<{ path: string; imageUrl: string }>;
  deleteUnusedStoreAsset: (accessToken: string, imageUrl: string) => Promise<'deleted' | 'ignored'>;
  updateStoreProfile: (
    accessToken: string,
    patch: Omit<StoreProfilePatch, 'expectedVersion'>,
    expectedVersion?: number,
  ) => Promise<UpdateStoreProfileResult>;
  updateStoreOrderingStatus: (
    accessToken: string,
    patch: Omit<StoreOrderingStatusPatch, 'expectedVersion'>,
    expectedVersion?: number,
  ) => Promise<MutationResult<StoreProfile>>;
  updateDeliveryPricing: (
    accessToken: string,
    patch: Omit<DeliveryPricingPatch, 'expectedVersion'>,
    expectedVersion?: number,
  ) => Promise<UpdateDeliveryPricingResult>;
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
  updateOrderPaymentStatus: (
    accessToken: string,
    orderId: string,
    paymentStatus: PaymentStatus,
    expectedVersion?: number,
  ) => Promise<MutationResult<OrderRecord>>;
  listAdminUsers: (accessToken: string) => Promise<AdminTeamMember[]>;
  createAdminUser: (
    accessToken: string,
    input: CreateAdminUserRequest,
  ) => Promise<CreateAdminUserResult>;
  updateAdminUser: (
    accessToken: string,
    userId: string,
    input: UpdateAdminUserRequest,
  ) => Promise<UpdateAdminUserResult>;
};

type DbMenuCategoryRow = {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  active: boolean;
  updated_at: string;
  version: number;
};

type DbOptionGroupRow = {
  id: string;
  name: string;
  description: string;
  selection_mode: OptionSelectionMode;
  required: boolean;
  min_select: number;
  max_select: number | null;
  sort_order: number;
  active: boolean;
  updated_at: string;
  version: number;
};

type DbOptionChoiceRow = {
  id: string;
  group_id: string;
  name: string;
  price_delta_php: number;
  available: boolean;
  is_default: boolean;
  sort_order: number;
  updated_at: string;
  version: number;
};

type DbMenuItemOptionGroupRow = {
  group_id: string;
  sort_order: number;
};

type DbMenuItemRow = {
  id: string;
  name: string;
  category: string;
  price_php: number;
  spec_label: string;
  description: string;
  image_url: string;
  available: boolean;
  featured: boolean;
  sort_order: number;
  updated_at: string;
  version: number;
  menu_item_option_groups?: DbMenuItemOptionGroupRow[];
};

type DbStoreSettingsRow = {
  id: number;
  delivery_enabled: boolean;
  delivery_base_fee_php: number;
  delivery_per_km_rate_php: number;
  delivery_max_distance_km: number | string;
  free_delivery_min_subtotal_php: number | null;
  origin_lat: number | null;
  origin_lng: number | null;
  store_name: string;
  branch_label: string;
  monogram: string;
  hero_headline: string;
  hero_subtext: string;
  hero_badge_label: string;
  address: string;
  landmark: string;
  contact_phone: string;
  hours_text: string;
  pickup_spot_label: string;
  logo_url: string;
  hero_image_url: string;
  external_links: unknown;
  queue_prefix: string;
  preparing_stage_label: string;
  theme_accent_preset: StoreThemePreset;
  theme_accent_hex: string | null;
  accepting_orders: boolean;
  closed_notice: string;
  pickup_enabled: boolean;
  dine_in_enabled: boolean;
  dine_in_table_required: boolean;
  payment_methods: unknown;
  updated_at: string;
  version: number;
};

type DbOrderLineRow = {
  line_id: string;
  item_id: string;
  name: string;
  unit_price_php: number;
  selected_options: unknown;
  addon_names: string[] | null;
  item_note: string | null;
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
  fulfillment: FulfillmentMode;
  table_number: string;
  delivery_eta_minutes: string | null;
  delivery_pin_lat: number | null;
  delivery_pin_lng: number | null;
  delivery_distance_km: number | string | null;
  delivery_fee_waived: boolean;
  address_or_notes: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  payment_reference: string;
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
  role: AdminRole;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

const ADMIN_USER_COLUMNS = 'user_id, email, role, active, created_at, updated_at';
const MENU_CATEGORY_COLUMNS = 'id, name, description, sort_order, active, updated_at, version';
const OPTION_GROUP_COLUMNS =
  'id, name, description, selection_mode, required, min_select, max_select, sort_order, active, updated_at, version';
const OPTION_CHOICE_COLUMNS =
  'id, group_id, name, price_delta_php, available, is_default, sort_order, updated_at, version';
const MENU_ITEM_COLUMNS =
  'id, name, category, price_php, spec_label, description, image_url, available, featured, sort_order, updated_at, version, menu_item_option_groups(group_id, sort_order)';
const STORE_SETTINGS_COLUMNS =
  'id, delivery_enabled, delivery_base_fee_php, delivery_per_km_rate_php, delivery_max_distance_km, free_delivery_min_subtotal_php, origin_lat, origin_lng, store_name, branch_label, monogram, hero_headline, hero_subtext, hero_badge_label, address, landmark, contact_phone, hours_text, pickup_spot_label, logo_url, hero_image_url, external_links, queue_prefix, preparing_stage_label, theme_accent_preset, theme_accent_hex, accepting_orders, closed_notice, pickup_enabled, dine_in_enabled, dine_in_table_required, payment_methods, updated_at, version';
const ORDER_COLUMNS =
  'id, queue_number, customer_name, contact_number, fulfillment, table_number, delivery_eta_minutes, delivery_pin_lat, delivery_pin_lng, delivery_distance_km, delivery_fee_waived, address_or_notes, payment_method, payment_status, payment_reference, subtotal_php, delivery_fee_php, total_php, status, created_at, updated_at, version, order_lines(line_id, item_id, name, unit_price_php, selected_options, addon_names, item_note, addons_price_php, quantity, line_total_php, position)';

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
  return `queue_number.ilike.${pattern},customer_name.ilike.${pattern},contact_number.ilike.${pattern},address_or_notes.ilike.${pattern},table_number.ilike.${pattern},payment_reference.ilike.${pattern}`;
}

function mapAdminTeamMember(row: DbAdminUserRow): AdminTeamMember {
  return {
    id: row.user_id,
    email: row.email,
    role: row.role,
    active: row.active,
    createdAt: row.created_at ? normalizeIsoTimestamp(row.created_at) : new Date(0).toISOString(),
    updatedAt: row.updated_at ? normalizeIsoTimestamp(row.updated_at) : new Date(0).toISOString(),
  };
}

function mapMenuCategory(row: DbMenuCategoryRow): MenuCategory {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
    active: row.active,
    updatedAt: normalizeIsoTimestamp(row.updated_at),
    version: row.version,
  };
}

function mapOptionChoice(row: DbOptionChoiceRow): OptionChoice {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    priceDeltaPhp: row.price_delta_php,
    available: row.available,
    isDefault: row.is_default,
    sortOrder: row.sort_order,
    updatedAt: normalizeIsoTimestamp(row.updated_at),
    version: row.version,
  };
}

function mapOptionGroup(row: DbOptionGroupRow, choices: OptionChoice[]): OptionGroup {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    selectionMode: row.selection_mode,
    required: row.required,
    minSelect: row.min_select,
    maxSelect: row.max_select,
    sortOrder: row.sort_order,
    active: row.active,
    choices,
    updatedAt: normalizeIsoTimestamp(row.updated_at),
    version: row.version,
  };
}

function mapMenuItem(row: DbMenuItemRow): MenuItem {
  const optionGroupIds = [...(row.menu_item_option_groups ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((link) => link.group_id);

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    pricePhp: row.price_php,
    specLabel: row.spec_label,
    description: row.description,
    imageUrl: row.image_url,
    available: row.available,
    featured: row.featured,
    optionGroupIds,
    sortOrder: row.sort_order,
    updatedAt: normalizeIsoTimestamp(row.updated_at),
    version: row.version,
  };
}

function mapSelectedOptions(raw: unknown): SelectedOptionSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const snapshots: SelectedOptionSnapshot[] = [];
  for (const entry of raw) {
    const parsed = selectedOptionSnapshotSchema.safeParse(entry);
    if (parsed.success) {
      snapshots.push(parsed.data);
    }
  }
  return snapshots;
}

function mapOriginCoords(
  row: Pick<DbStoreSettingsRow, 'origin_lat' | 'origin_lng'> | null,
): GeoCoordinates | null {
  if (!row || row.origin_lat === null || row.origin_lng === null) {
    return null;
  }
  const lat = Number(row.origin_lat);
  const lng = Number(row.origin_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
}

function mapExternalLinks(raw: unknown): ExternalLink[] {
  if (!Array.isArray(raw)) return [];
  const links: ExternalLink[] = [];
  for (const item of raw) {
    const parsed = externalLinkSchema.safeParse(item);
    if (parsed.success) {
      links.push(parsed.data);
    }
  }
  return links;
}

function mapPaymentMethods(raw: unknown): PaymentMethodsConfig {
  const parsed = paymentMethodsConfigSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  return {
    cash: { ...DEFAULT_PAYMENT_METHODS.cash },
    gcash: { ...DEFAULT_PAYMENT_METHODS.gcash },
    maya: { ...DEFAULT_PAYMENT_METHODS.maya },
    bank_transfer: { ...DEFAULT_PAYMENT_METHODS.bank_transfer },
  };
}

function mapStoreProfile(row: DbStoreSettingsRow | null): StoreProfile {
  if (!row) {
    return {
      ...DEFAULT_STORE_PROFILE,
      externalLinks: [],
      paymentMethods: mapPaymentMethods(DEFAULT_PAYMENT_METHODS),
    };
  }
  return {
    storeName: row.store_name,
    branchLabel: row.branch_label,
    monogram: row.monogram,
    heroHeadline: row.hero_headline,
    heroSubtext: row.hero_subtext,
    heroBadgeLabel: row.hero_badge_label,
    address: row.address,
    landmark: row.landmark,
    contactPhone: row.contact_phone,
    hoursText: row.hours_text,
    pickupSpotLabel: row.pickup_spot_label,
    logoUrl: row.logo_url,
    heroImageUrl: row.hero_image_url,
    externalLinks: mapExternalLinks(row.external_links),
    queuePrefix: row.queue_prefix,
    preparingStageLabel: row.preparing_stage_label,
    themeAccentPreset: row.theme_accent_preset,
    themeAccentHex: row.theme_accent_hex,
    acceptingOrders: row.accepting_orders,
    closedNotice: row.closed_notice,
    pickupEnabled: row.pickup_enabled,
    deliveryEnabled: row.delivery_enabled,
    dineInEnabled: row.dine_in_enabled,
    dineInTableRequired: row.dine_in_table_required,
    paymentMethods: mapPaymentMethods(row.payment_methods),
    originCoords: mapOriginCoords(row),
    updatedAt: normalizeIsoTimestamp(row.updated_at),
    version: row.version,
  };
}

function mapDeliveryPricing(row: DbStoreSettingsRow | null): DeliveryPricingConfig {
  if (!row) {
    return {
      deliveryEnabled: false,
      baseFeePhp: DEFAULT_DELIVERY_BASE_FEE_PHP,
      perKmRatePhp: DEFAULT_DELIVERY_PER_KM_RATE_PHP,
      maxDistanceKm: DEFAULT_DELIVERY_MAX_DISTANCE_KM,
      freeDeliveryMinSubtotalPhp: DEFAULT_FREE_DELIVERY_MIN_SUBTOTAL_PHP,
      originCoords: null,
    };
  }
  return {
    deliveryEnabled: row.delivery_enabled,
    baseFeePhp: row.delivery_base_fee_php,
    perKmRatePhp: row.delivery_per_km_rate_php,
    maxDistanceKm: Number(row.delivery_max_distance_km),
    freeDeliveryMinSubtotalPhp: row.free_delivery_min_subtotal_php,
    originCoords: mapOriginCoords(row),
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
      selectedOptions: mapSelectedOptions(line.selected_options),
      addonNames: line.addon_names ?? [],
      itemNote: line.item_note ?? '',
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
    tableNumber: row.table_number ?? '',
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
    paymentStatus: row.payment_status ?? 'unpaid',
    paymentReference: row.payment_reference ?? '',
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

  async function fetchStoreSettingsRow(client: SupabaseClient): Promise<DbStoreSettingsRow | null> {
    const { data, error } = await client
      .from('store_settings')
      .select(STORE_SETTINGS_COLUMNS)
      .eq('id', 1)
      .maybeSingle<DbStoreSettingsRow>();

    if (error) throw error;
    return data ?? null;
  }

  async function fetchDeliveryPricingWithClient(
    client: SupabaseClient,
  ): Promise<DeliveryPricingConfig> {
    const data = await fetchStoreSettingsRow(client);
    return mapDeliveryPricing(data);
  }

  async function cleanupUnusedMenuImages(
    client: SupabaseClient,
    candidateUrls: readonly string[],
    allowedPrefixes?: readonly string[],
  ): Promise<number> {
    const candidateUrlVariants = new Set<string>();
    const candidatePaths = new Set<string>();
    for (const rawUrl of candidateUrls) {
      const trimmed = rawUrl.trim();
      const objectPath = extractManagedMenuImagePath(trimmed, config.supabaseUrl);
      if (!objectPath) continue;
      if (allowedPrefixes && !allowedPrefixes.some((prefix) => objectPath.startsWith(prefix))) {
        continue;
      }
      candidatePaths.add(objectPath);
      candidateUrlVariants.add(trimmed);
      for (const variant of buildManagedImageUrlVariants(objectPath, config.supabaseUrl)) {
        candidateUrlVariants.add(variant);
      }
    }
    if (candidatePaths.size === 0) return 0;

    const [menuRefsRes, storeRefsRes] = await Promise.all([
      client
        .from('menu_items')
        .select('image_url')
        .in('image_url', [...candidateUrlVariants])
        .returns<{ image_url: string }[]>(),
      client
        .from('store_settings')
        .select('logo_url, hero_image_url, payment_methods')
        .eq('id', 1)
        .maybeSingle<{ logo_url: string; hero_image_url: string; payment_methods: unknown }>(),
    ]);

    if (menuRefsRes.error || storeRefsRes.error) {
      if (config.nodeEnv !== 'test') {
        console.warn('[api] skipped managed asset cleanup due to reference check error');
      }
      return 0;
    }

    const referencedUrls: string[] = [];
    for (const row of menuRefsRes.data ?? []) {
      if (row.image_url) referencedUrls.push(row.image_url);
    }
    if (storeRefsRes.data?.logo_url) {
      referencedUrls.push(storeRefsRes.data.logo_url);
    }
    if (storeRefsRes.data?.hero_image_url) {
      referencedUrls.push(storeRefsRes.data.hero_image_url);
    }
    if (storeRefsRes.data?.payment_methods) {
      referencedUrls.push(...extractPaymentMethodQrUrls(storeRefsRes.data.payment_methods));
    }

    const pathsToRemove = resolveUnreferencedManagedPaths({
      candidateUrls,
      referencedUrls,
      supabaseUrl: config.supabaseUrl,
      ...(allowedPrefixes ? { allowedPrefixes } : {}),
    });
    if (pathsToRemove.length === 0) return 0;

    const { error: removeError } = await client.storage
      .from(MENU_IMAGES_BUCKET)
      .remove(pathsToRemove);
    if (removeError && config.nodeEnv !== 'test') {
      console.warn('[api] managed asset storage cleanup failed:', removeError.message);
    }
    return removeError ? 0 : pathsToRemove.length;
  }

  async function listMenuCategoriesWithClient(client: SupabaseClient): Promise<MenuCategory[]> {
    const { data, error } = await client
      .from('menu_categories')
      .select(MENU_CATEGORY_COLUMNS)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .returns<DbMenuCategoryRow[]>();

    if (error) throw error;
    return (data ?? []).map(mapMenuCategory);
  }

  async function listOptionGroupsWithClient(client: SupabaseClient): Promise<OptionGroup[]> {
    const [groupsRes, choicesRes] = await Promise.all([
      client
        .from('option_groups')
        .select(OPTION_GROUP_COLUMNS)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .returns<DbOptionGroupRow[]>(),
      client
        .from('option_choices')
        .select(OPTION_CHOICE_COLUMNS)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .returns<DbOptionChoiceRow[]>(),
    ]);

    if (groupsRes.error) throw groupsRes.error;
    if (choicesRes.error) throw choicesRes.error;

    const choicesByGroup = new Map<string, OptionChoice[]>();
    for (const choiceRow of choicesRes.data ?? []) {
      const mapped = mapOptionChoice(choiceRow);
      const list = choicesByGroup.get(mapped.groupId) ?? [];
      list.push(mapped);
      choicesByGroup.set(mapped.groupId, list);
    }

    return (groupsRes.data ?? []).map((groupRow) =>
      mapOptionGroup(groupRow, choicesByGroup.get(groupRow.id) ?? []),
    );
  }

  async function fetchOptionGroupByIdWithClient(
    client: SupabaseClient,
    id: string,
  ): Promise<OptionGroup | null> {
    const [groupRes, choicesRes] = await Promise.all([
      client
        .from('option_groups')
        .select(OPTION_GROUP_COLUMNS)
        .eq('id', id)
        .maybeSingle<DbOptionGroupRow>(),
      client
        .from('option_choices')
        .select(OPTION_CHOICE_COLUMNS)
        .eq('group_id', id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .returns<DbOptionChoiceRow[]>(),
    ]);

    if (groupRes.error) throw groupRes.error;
    if (choicesRes.error) throw choicesRes.error;
    if (!groupRes.data) return null;

    return mapOptionGroup(groupRes.data, (choicesRes.data ?? []).map(mapOptionChoice));
  }

  async function syncMenuItemOptionGroups(
    client: SupabaseClient,
    itemId: string,
    optionGroupIds: readonly string[],
  ): Promise<void> {
    const uniqueGroupIds: string[] = [];
    const seen = new Set<string>();
    for (const groupId of optionGroupIds) {
      if (!seen.has(groupId)) {
        seen.add(groupId);
        uniqueGroupIds.push(groupId);
      }
    }

    const { error: deleteError } = await client
      .from('menu_item_option_groups')
      .delete()
      .eq('item_id', itemId);
    if (deleteError) throw deleteError;

    if (uniqueGroupIds.length === 0) return;

    const linkRows = uniqueGroupIds.map((groupId, idx) => ({
      item_id: itemId,
      group_id: groupId,
      sort_order: idx + 1,
    }));
    const { error: insertError } = await client.from('menu_item_option_groups').insert(linkRows);
    if (insertError) throw insertError;
  }

  return {
    async checkDatabaseReady() {
      const { error } = await serviceClient.from('store_settings').select('id').limit(1);
      return !error;
    },

    async getCatalog() {
      const [menuRes, categories, optionGroups, settingsRow] = await Promise.all([
        anonClient
          .from('menu_items')
          .select(MENU_ITEM_COLUMNS)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false })
          .returns<DbMenuItemRow[]>(),
        listMenuCategoriesWithClient(anonClient),
        listOptionGroupsWithClient(anonClient),
        fetchStoreSettingsRow(anonClient),
      ]);

      if (menuRes.error) throw menuRes.error;

      return {
        store: mapStoreProfile(settingsRow),
        categories,
        optionGroups,
        menu: (menuRes.data ?? []).map(mapMenuItem),
        deliveryPricing: mapDeliveryPricing(settingsRow),
      };
    },

    async getStoreProfile() {
      const settingsRow = await fetchStoreSettingsRow(anonClient);
      return mapStoreProfile(settingsRow);
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
            item.specLabel.toLowerCase().includes(needle),
        );
      }
      return items;
    },

    async listMenuCategories(accessToken) {
      const client = createUserRlsClient(accessToken);
      return listMenuCategoriesWithClient(client);
    },

    async createMenuCategory(accessToken, input) {
      const client = createUserRlsClient(accessToken);
      const { data: existingRows, error: idsError } = await client
        .from('menu_categories')
        .select('id, sort_order')
        .returns<{ id: string; sort_order: number }[]>();
      if (idsError) throw idsError;

      const existingIds = new Set((existingRows ?? []).map((row) => row.id));
      const maxSortOrder = (existingRows ?? []).reduce(
        (max, row) => Math.max(max, row.sort_order),
        0,
      );
      const sortOrder = input.sortOrder ?? maxSortOrder + 1;
      const explicitId = input.id;
      const id = explicitId ?? slugifyCategoryId(input.name, existingIds);

      const { data, error } = await client
        .from('menu_categories')
        .insert({
          id,
          name: input.name,
          description: input.description,
          sort_order: sortOrder,
          active: input.active,
        })
        .select(MENU_CATEGORY_COLUMNS)
        .single<DbMenuCategoryRow>();

      if (error) {
        if (error.code === '23505') {
          return { status: 'conflict_slug' };
        }
        throw error;
      }

      return { status: 'ok', data: mapMenuCategory(data) };
    },

    async updateMenuCategory(accessToken, id, patch, expectedVersion) {
      const client = createUserRlsClient(accessToken);
      const updateColumns: Record<string, unknown> = {};
      if (patch.name !== undefined) updateColumns.name = patch.name;
      if (patch.description !== undefined) updateColumns.description = patch.description;
      if (patch.sortOrder !== undefined) updateColumns.sort_order = patch.sortOrder;
      if (patch.active !== undefined) updateColumns.active = patch.active;

      let updateQuery = client.from('menu_categories').update(updateColumns).eq('id', id);
      if (expectedVersion !== undefined) {
        updateQuery = updateQuery.eq('version', expectedVersion);
      }

      const { data, error } = await updateQuery
        .select(MENU_CATEGORY_COLUMNS)
        .maybeSingle<DbMenuCategoryRow>();
      if (error) throw error;
      if (data) {
        return { status: 'ok', data: mapMenuCategory(data) };
      }

      const { data: current, error: fetchError } = await client
        .from('menu_categories')
        .select(MENU_CATEGORY_COLUMNS)
        .eq('id', id)
        .maybeSingle<DbMenuCategoryRow>();
      if (fetchError) throw fetchError;
      if (!current) return { status: 'not_found' };
      return { status: 'conflict', latest: mapMenuCategory(current) };
    },

    async reorderMenuCategories(accessToken, orderedIds) {
      const client = createUserRlsClient(accessToken);
      const existing = await listMenuCategoriesWithClient(client);
      const existingById = new Map(existing.map((entry) => [entry.id, entry]));
      const nextOrderIds: string[] = [];
      const seen = new Set<string>();

      for (const id of orderedIds) {
        if (existingById.has(id) && !seen.has(id)) {
          seen.add(id);
          nextOrderIds.push(id);
        }
      }
      for (const entry of existing) {
        if (!seen.has(entry.id)) {
          seen.add(entry.id);
          nextOrderIds.push(entry.id);
        }
      }

      for (let idx = 0; idx < nextOrderIds.length; idx += 1) {
        const categoryId = nextOrderIds[idx];
        if (!categoryId) continue;
        const { error } = await client
          .from('menu_categories')
          .update({ sort_order: idx + 1 })
          .eq('id', categoryId);
        if (error) throw error;
      }

      return listMenuCategoriesWithClient(client);
    },

    async deleteMenuCategory(accessToken, id) {
      const client = createUserRlsClient(accessToken);
      const { data, error } = await client
        .from('menu_categories')
        .delete()
        .eq('id', id)
        .select('id')
        .returns<{ id: string }[]>();

      if (error) {
        if (error.code === '23503') {
          return 'in_use';
        }
        throw error;
      }
      if (!data || data.length === 0) return 'not_found';
      return 'deleted';
    },

    async listOptionGroups(accessToken) {
      const client = createUserRlsClient(accessToken);
      return listOptionGroupsWithClient(client);
    },

    async createOptionGroup(accessToken, input) {
      const client = createUserRlsClient(accessToken);
      const [existingGroupsRes, existingChoicesRes] = await Promise.all([
        client
          .from('option_groups')
          .select('id, sort_order')
          .returns<{ id: string; sort_order: number }[]>(),
        client.from('option_choices').select('id').returns<{ id: string }[]>(),
      ]);
      if (existingGroupsRes.error) throw existingGroupsRes.error;
      if (existingChoicesRes.error) throw existingChoicesRes.error;

      const existingGroupIds = new Set((existingGroupsRes.data ?? []).map((row) => row.id));
      const existingChoiceIds = new Set((existingChoicesRes.data ?? []).map((row) => row.id));
      const maxSortOrder = (existingGroupsRes.data ?? []).reduce(
        (max, row) => Math.max(max, row.sort_order),
        0,
      );
      const groupId = input.id ?? slugifyOptionGroupId(input.name, existingGroupIds);
      const sortOrder = input.sortOrder ?? maxSortOrder + 1;

      const { data: groupRow, error: groupError } = await client
        .from('option_groups')
        .insert({
          id: groupId,
          name: input.name,
          description: input.description,
          selection_mode: input.selectionMode,
          required: input.required,
          min_select: input.minSelect,
          max_select: input.maxSelect,
          sort_order: sortOrder,
          active: input.active,
        })
        .select(OPTION_GROUP_COLUMNS)
        .single<DbOptionGroupRow>();

      if (groupError) {
        if (groupError.code === '23505') {
          return { status: 'conflict_slug' };
        }
        throw groupError;
      }

      let mappedChoices: OptionChoice[] = [];
      if (input.choices.length > 0) {
        const choiceRows = input.choices.map((choice, idx) => {
          const choiceId = choice.id ?? slugifyOptionChoiceId(choice.name, existingChoiceIds);
          existingChoiceIds.add(choiceId);
          return {
            id: choiceId,
            group_id: groupRow.id,
            name: choice.name,
            price_delta_php: choice.priceDeltaPhp,
            available: choice.available,
            is_default: choice.isDefault,
            sort_order: choice.sortOrder ?? idx + 1,
          };
        });

        const { data: insertedChoices, error: choicesError } = await client
          .from('option_choices')
          .insert(choiceRows)
          .select(OPTION_CHOICE_COLUMNS)
          .order('sort_order', { ascending: true })
          .returns<DbOptionChoiceRow[]>();

        if (choicesError) {
          await client.from('option_groups').delete().eq('id', groupRow.id);
          if (choicesError.code === '23505') {
            return { status: 'conflict_slug' };
          }
          throw choicesError;
        }
        mappedChoices = (insertedChoices ?? []).map(mapOptionChoice);
      }

      return { status: 'ok', data: mapOptionGroup(groupRow, mappedChoices) };
    },

    async updateOptionGroup(accessToken, id, patch, expectedVersion) {
      const client = createUserRlsClient(accessToken);
      const existing = await fetchOptionGroupByIdWithClient(client, id);
      if (!existing) {
        return { status: 'not_found' };
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
      const nextChoicesForCheck = patch.choices ?? existing.choices;
      if (
        nextSelectionMode === 'single' &&
        nextChoicesForCheck.filter((choice) => choice.isDefault).length > 1
      ) {
        return {
          status: 'validation_error',
          field: 'choices',
          message: 'Single-select option groups can have at most one default choice.',
        };
      }

      const updateColumns: Record<string, unknown> = {
        name: patch.name ?? existing.name,
        description: patch.description ?? existing.description,
        selection_mode: nextSelectionMode,
        required: nextRequired,
        min_select: nextMinSelect,
        max_select: nextMaxSelect,
        sort_order: patch.sortOrder ?? existing.sortOrder,
        active: patch.active ?? existing.active,
      };

      let plannedChoiceSync: {
        removedIds: string[];
        toUpdate: Array<{
          id: string;
          name: string;
          price_delta_php: number;
          available: boolean;
          is_default: boolean;
          sort_order: number;
        }>;
        toInsert: Array<{
          id: string;
          group_id: string;
          name: string;
          price_delta_php: number;
          available: boolean;
          is_default: boolean;
          sort_order: number;
        }>;
      } | null = null;

      if (patch.choices !== undefined) {
        const { data: allChoiceRows, error: allChoicesError } = await client
          .from('option_choices')
          .select('id, group_id')
          .returns<{ id: string; group_id: string }[]>();
        if (allChoicesError) throw allChoicesError;

        const allChoiceIds = new Set((allChoiceRows ?? []).map((row) => row.id));
        const otherGroupChoiceIds = new Set(
          (allChoiceRows ?? []).filter((row) => row.group_id !== id).map((row) => row.id),
        );
        const existingGroupChoiceIds = new Set(existing.choices.map((choice) => choice.id));

        const seenRequestedIds = new Set<string>();
        const toInsert: Array<{
          id: string;
          group_id: string;
          name: string;
          price_delta_php: number;
          available: boolean;
          is_default: boolean;
          sort_order: number;
        }> = [];
        const toUpdate: Array<{
          id: string;
          name: string;
          price_delta_php: number;
          available: boolean;
          is_default: boolean;
          sort_order: number;
        }> = [];

        for (let idx = 0; idx < patch.choices.length; idx += 1) {
          const choice = patch.choices[idx];
          if (!choice) continue;
          const sortOrder = choice.sortOrder ?? idx + 1;
          if (choice.id) {
            if (otherGroupChoiceIds.has(choice.id) || seenRequestedIds.has(choice.id)) {
              return { status: 'conflict_slug' };
            }
            seenRequestedIds.add(choice.id);
            if (existingGroupChoiceIds.has(choice.id)) {
              toUpdate.push({
                id: choice.id,
                name: choice.name,
                price_delta_php: choice.priceDeltaPhp,
                available: choice.available,
                is_default: choice.isDefault,
                sort_order: sortOrder,
              });
            } else {
              allChoiceIds.add(choice.id);
              toInsert.push({
                id: choice.id,
                group_id: id,
                name: choice.name,
                price_delta_php: choice.priceDeltaPhp,
                available: choice.available,
                is_default: choice.isDefault,
                sort_order: sortOrder,
              });
            }
          } else {
            const generatedId = slugifyOptionChoiceId(choice.name, allChoiceIds);
            allChoiceIds.add(generatedId);
            seenRequestedIds.add(generatedId);
            toInsert.push({
              id: generatedId,
              group_id: id,
              name: choice.name,
              price_delta_php: choice.priceDeltaPhp,
              available: choice.available,
              is_default: choice.isDefault,
              sort_order: sortOrder,
            });
          }
        }

        plannedChoiceSync = {
          removedIds: [...existingGroupChoiceIds].filter(
            (choiceId) => !seenRequestedIds.has(choiceId),
          ),
          toUpdate,
          toInsert,
        };
      }

      let updateQuery = client.from('option_groups').update(updateColumns).eq('id', id);
      if (expectedVersion !== undefined) {
        updateQuery = updateQuery.eq('version', expectedVersion);
      }

      const { data: updatedGroup, error: updateError } = await updateQuery
        .select(OPTION_GROUP_COLUMNS)
        .maybeSingle<DbOptionGroupRow>();
      if (updateError) throw updateError;
      if (!updatedGroup) {
        const current = await fetchOptionGroupByIdWithClient(client, id);
        if (!current) return { status: 'not_found' };
        return { status: 'conflict', latest: current };
      }

      if (plannedChoiceSync) {
        if (plannedChoiceSync.removedIds.length > 0) {
          const { error: deleteError } = await client
            .from('option_choices')
            .delete()
            .eq('group_id', id)
            .in('id', plannedChoiceSync.removedIds);
          if (deleteError) throw deleteError;
        }

        for (const row of plannedChoiceSync.toUpdate) {
          const { error: choiceUpdateError } = await client
            .from('option_choices')
            .update({
              name: row.name,
              price_delta_php: row.price_delta_php,
              available: row.available,
              is_default: row.is_default,
              sort_order: row.sort_order,
            })
            .eq('id', row.id)
            .eq('group_id', id);
          if (choiceUpdateError) throw choiceUpdateError;
        }

        if (plannedChoiceSync.toInsert.length > 0) {
          const { error: choiceInsertError } = await client
            .from('option_choices')
            .insert(plannedChoiceSync.toInsert);
          if (choiceInsertError) {
            if (choiceInsertError.code === '23505') {
              return { status: 'conflict_slug' };
            }
            throw choiceInsertError;
          }
        }
      }

      const refreshed = await fetchOptionGroupByIdWithClient(client, id);
      if (!refreshed) return { status: 'not_found' };
      return { status: 'ok', data: refreshed };
    },

    async reorderOptionGroups(accessToken, orderedIds) {
      const client = createUserRlsClient(accessToken);
      const existing = await listOptionGroupsWithClient(client);
      const existingById = new Map(existing.map((entry) => [entry.id, entry]));
      const nextOrderIds: string[] = [];
      const seen = new Set<string>();

      for (const id of orderedIds) {
        if (existingById.has(id) && !seen.has(id)) {
          seen.add(id);
          nextOrderIds.push(id);
        }
      }
      for (const entry of existing) {
        if (!seen.has(entry.id)) {
          seen.add(entry.id);
          nextOrderIds.push(entry.id);
        }
      }

      for (let idx = 0; idx < nextOrderIds.length; idx += 1) {
        const groupId = nextOrderIds[idx];
        if (!groupId) continue;
        const { error } = await client
          .from('option_groups')
          .update({ sort_order: idx + 1 })
          .eq('id', groupId);
        if (error) throw error;
      }

      return listOptionGroupsWithClient(client);
    },

    async deleteOptionGroup(accessToken, id) {
      const client = createUserRlsClient(accessToken);
      const { data, error } = await client
        .from('option_groups')
        .delete()
        .eq('id', id)
        .select('id')
        .returns<{ id: string }[]>();

      if (error) {
        if (error.code === '23503') {
          return 'in_use';
        }
        throw error;
      }
      if (!data || data.length === 0) return 'not_found';
      return 'deleted';
    },

    async setOptionChoiceAvailability(accessToken, id, available, expectedVersion) {
      const client = createUserRlsClient(accessToken);
      let updateQuery = client.from('option_choices').update({ available }).eq('id', id);

      if (expectedVersion !== undefined) {
        updateQuery = updateQuery.eq('version', expectedVersion);
      }

      const { data, error } = await updateQuery
        .select(OPTION_CHOICE_COLUMNS)
        .maybeSingle<DbOptionChoiceRow>();
      if (error) throw error;
      if (data) return { status: 'ok', data: mapOptionChoice(data) };

      const { data: current, error: fetchError } = await client
        .from('option_choices')
        .select(OPTION_CHOICE_COLUMNS)
        .eq('id', id)
        .maybeSingle<DbOptionChoiceRow>();
      if (fetchError) throw fetchError;
      if (!current) return { status: 'not_found' };
      return { status: 'conflict', latest: mapOptionChoice(current) };
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
        p_table_number: request.fulfillment === 'dine-in' ? request.tableNumber : '',
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
        p_payment_reference: request.paymentMethod !== 'cash' ? request.paymentReference : '',
        p_items: request.items,
        p_expected_total_php: request.expectedTotalPhp ?? null,
      });

      if (error) {
        const msg = error.message ?? '';
        if (msg.includes('STORE_CLOSED')) {
          const settingsRow = await fetchStoreSettingsRow(serviceClient).catch(() => null);
          return {
            status: 'store_closed',
            closedNotice: settingsRow?.closed_notice?.trim() ?? '',
          };
        }
        if (msg.includes('CUSTOMER_NAME_REQUIRED')) {
          return { status: 'customer_name_required' };
        }
        if (msg.includes('FULFILLMENT_UNAVAILABLE')) {
          return { status: 'fulfillment_unavailable' };
        }
        if (msg.includes('TABLE_NUMBER_REQUIRED')) {
          return { status: 'table_number_required' };
        }
        if (msg.includes('INVALID_TABLE_NUMBER')) {
          return { status: 'invalid_table_number' };
        }
        if (msg.includes('PAYMENT_METHOD_UNAVAILABLE')) {
          return { status: 'payment_method_unavailable' };
        }
        if (msg.includes('PAYMENT_REFERENCE_REQUIRED')) {
          return { status: 'payment_reference_required' };
        }
        if (msg.includes('INVALID_PAYMENT_REFERENCE')) {
          return { status: 'invalid_payment_reference' };
        }
        if (msg.startsWith('ITEM_UNAVAILABLE:')) {
          return { status: 'item_unavailable', itemId: msg.slice('ITEM_UNAVAILABLE:'.length) };
        }
        if (msg.startsWith('INVALID_OPTION_SELECTION')) {
          const optionId = msg.includes(':')
            ? msg.slice('INVALID_OPTION_SELECTION:'.length)
            : undefined;
          return { status: 'invalid_option_selection', ...(optionId ? { optionId } : {}) };
        }
        if (msg.startsWith('OPTION_UNAVAILABLE')) {
          const optionId = msg.includes(':') ? msg.slice('OPTION_UNAVAILABLE:'.length) : undefined;
          return { status: 'option_unavailable', ...(optionId ? { optionId } : {}) };
        }
        if (msg.startsWith('REQUIRED_OPTION_MISSING')) {
          const groupId = msg.includes(':')
            ? msg.slice('REQUIRED_OPTION_MISSING:'.length)
            : undefined;
          return { status: 'required_option_missing', ...(groupId ? { groupId } : {}) };
        }
        if (msg.startsWith('OPTION_LIMIT_EXCEEDED')) {
          const groupId = msg.includes(':')
            ? msg.slice('OPTION_LIMIT_EXCEEDED:'.length)
            : undefined;
          return { status: 'option_limit_exceeded', ...(groupId ? { groupId } : {}) };
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
        if (msg.includes('DELIVERY_PIN_REQUIRED')) {
          return { status: 'delivery_pin_required' };
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

    async cancelOrderByReceipt(orderId, receiptTokenHash) {
      if (!UUID_REGEX.test(orderId)) {
        return { status: 'not_found' };
      }
      const { data, error } = await serviceClient.rpc('cancel_order_by_receipt', {
        p_order_id: orderId,
        p_receipt_token_hash: receiptTokenHash,
      });
      if (error) throw error;
      const payload = data as
        | { outcome: 'ok'; order: OrderRecord }
        | { outcome: 'not_cancellable'; order: OrderRecord }
        | null;
      if (!payload || !payload.order) {
        return { status: 'not_found' };
      }
      if (payload.outcome === 'not_cancellable') {
        return { status: 'not_cancellable', order: payload.order };
      }
      return { status: 'ok', order: payload.order };
    },

    async submitPaymentReferenceByReceipt(orderId, receiptTokenHash, paymentReference) {
      if (!UUID_REGEX.test(orderId)) {
        return { status: 'not_found' };
      }
      const { data, error } = await serviceClient.rpc('submit_payment_reference_by_receipt', {
        p_order_id: orderId,
        p_receipt_token_hash: receiptTokenHash,
        p_payment_reference: paymentReference,
      });
      if (error) throw error;
      const payload = data as {
        outcome:
          'ok' | 'invalid_reference' | 'cash_not_applicable' | 'order_cancelled' | 'already_paid';
        order: OrderRecord;
      } | null;
      if (!payload || !payload.order) {
        return { status: 'not_found' };
      }
      return { status: payload.outcome, order: payload.order };
    },

    async getPublicOrderStatusByQueue(queueNumber) {
      const cleaned = queueNumber.trim();
      if (!cleaned) return null;
      const { data, error } = await serviceClient.rpc('get_public_order_status_by_queue', {
        p_queue_number: cleaned,
      });
      if (error) throw error;
      return (data as PublicOrderTracker | null) ?? null;
    },

    async cancelPublicOrderByQueue(queueNumber, verification) {
      const cleaned = queueNumber.trim();
      if (!cleaned) return { status: 'not_found' };
      const { data, error } = await serviceClient.rpc('cancel_public_order_by_queue', {
        p_queue_number: cleaned,
        p_contact_number: verification.contactNumber ?? null,
      });
      if (error) throw error;
      const payload = data as
        | { outcome: 'ok'; tracker: PublicOrderTracker }
        | { outcome: 'not_cancellable'; tracker: PublicOrderTracker }
        | { outcome: 'verification_failed' }
        | null;
      if (!payload) {
        return { status: 'not_found' };
      }
      if (payload.outcome === 'verification_failed') {
        return { status: 'verification_failed' };
      }
      if (payload.outcome === 'not_cancellable') {
        return { status: 'not_cancellable', tracker: payload.tracker };
      }
      return { status: 'ok', tracker: payload.tracker };
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
      try {
        const { error } = await serviceClient.auth.admin.signOut(accessToken, 'local');
        return !error;
      } catch {
        return false;
      }
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
          spec_label: input.specLabel,
          description: input.description,
          image_url: input.imageUrl,
          available: input.available,
          featured: input.featured,
          sort_order: input.sortOrder ?? 0,
        })
        .select(MENU_ITEM_COLUMNS)
        .single<DbMenuItemRow>();

      if (error) {
        if (error.code === '23505') {
          return { status: 'conflict_slug' };
        }
        if (error.code === '23503') {
          return {
            status: 'invalid_reference',
            detail: 'Selected category does not exist.',
          };
        }
        throw error;
      }

      if (input.optionGroupIds.length > 0) {
        try {
          await syncMenuItemOptionGroups(client, data.id, input.optionGroupIds);
        } catch (linkError) {
          await client.from('menu_items').delete().eq('id', data.id);
          if (
            typeof linkError === 'object' &&
            linkError !== null &&
            'code' in linkError &&
            (linkError as { code?: string }).code === '23503'
          ) {
            return {
              status: 'invalid_reference',
              detail: 'One or more selected option groups do not exist.',
            };
          }
          throw linkError;
        }
      }

      const { data: refreshed, error: refreshError } = await client
        .from('menu_items')
        .select(MENU_ITEM_COLUMNS)
        .eq('id', data.id)
        .single<DbMenuItemRow>();
      if (refreshError) throw refreshError;
      return { status: 'ok', data: mapMenuItem(refreshed) };
    },

    async updateMenuItem(accessToken, id, input, expectedVersion) {
      const client = createUserRlsClient(accessToken);
      const { data: beforeRow } = await client
        .from('menu_items')
        .select('image_url')
        .eq('id', id)
        .maybeSingle<{ image_url: string }>();

      let updateQuery = client
        .from('menu_items')
        .update({
          name: input.name,
          category: input.category,
          price_php: input.pricePhp,
          spec_label: input.specLabel,
          description: input.description,
          image_url: input.imageUrl,
          available: input.available,
          featured: input.featured,
          ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
        })
        .eq('id', id);

      if (expectedVersion !== undefined) {
        updateQuery = updateQuery.eq('version', expectedVersion);
      }

      const { data, error } = await updateQuery
        .select(MENU_ITEM_COLUMNS)
        .maybeSingle<DbMenuItemRow>();
      if (error) {
        if (error.code === '23503') {
          return {
            status: 'invalid_reference',
            detail: 'Selected category does not exist.',
          };
        }
        throw error;
      }
      if (data) {
        try {
          await syncMenuItemOptionGroups(client, data.id, input.optionGroupIds);
        } catch (linkError) {
          if (
            typeof linkError === 'object' &&
            linkError !== null &&
            'code' in linkError &&
            (linkError as { code?: string }).code === '23503'
          ) {
            return {
              status: 'invalid_reference',
              detail: 'One or more selected option groups do not exist.',
            };
          }
          throw linkError;
        }
        if (beforeRow?.image_url && beforeRow.image_url !== data.image_url) {
          await cleanupUnusedMenuImages(client, [beforeRow.image_url]).catch(() => undefined);
        }
        const { data: refreshed, error: refreshError } = await client
          .from('menu_items')
          .select(MENU_ITEM_COLUMNS)
          .eq('id', data.id)
          .single<DbMenuItemRow>();
        if (refreshError) throw refreshError;
        return { status: 'ok', data: mapMenuItem(refreshed) };
      }

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
        .select('id, image_url')
        .returns<{ id: string; image_url: string }[]>();
      if (error) throw error;
      if (!data || data.length === 0) return 'not_found';
      const deletedUrls = data.map((row) => row.image_url).filter(Boolean);
      if (deletedUrls.length > 0) {
        await cleanupUnusedMenuImages(client, deletedUrls).catch(() => undefined);
      }
      return 'deleted';
    },

    async resetMenuCatalog(accessToken) {
      const client = createUserRlsClient(accessToken);
      const { data: previousRows, error: prevError } = await client
        .from('menu_items')
        .select('image_url')
        .returns<{ image_url: string }[]>();
      if (prevError) throw prevError;
      const previousUrls = (previousRows ?? []).map((row) => row.image_url).filter(Boolean);

      const categoriesPayload = DEFAULT_MENU_CATEGORIES.map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
        sortOrder: category.sortOrder,
        active: category.active,
      }));
      const optionGroupsPayload = DEFAULT_OPTION_GROUPS.map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        selectionMode: group.selectionMode,
        required: group.required,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        sortOrder: group.sortOrder,
        active: group.active,
      }));
      const optionChoicesPayload = DEFAULT_OPTION_GROUPS.flatMap((group) =>
        group.choices.map((choice) => ({
          id: choice.id,
          groupId: group.id,
          name: choice.name,
          priceDeltaPhp: choice.priceDeltaPhp,
          available: choice.available,
          isDefault: choice.isDefault,
          sortOrder: choice.sortOrder,
        })),
      );
      const menuItemsPayload = DEFAULT_MENU_ITEMS.map((item, idx) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        pricePhp: item.pricePhp,
        specLabel: item.specLabel,
        description: item.description,
        imageUrl: item.imageUrl,
        available: item.available,
        featured: item.featured,
        sortOrder: idx + 1,
      }));
      const itemOptionGroupsPayload = DEFAULT_MENU_ITEMS.flatMap((item) =>
        item.optionGroupIds.map((groupId, idx) => ({
          itemId: item.id,
          groupId,
          sortOrder: idx + 1,
        })),
      );

      const { error: rpcError } = await serviceClient.rpc('reset_demo_catalog', {
        p_categories: categoriesPayload,
        p_option_groups: optionGroupsPayload,
        p_option_choices: optionChoicesPayload,
        p_menu_items: menuItemsPayload,
        p_item_option_groups: itemOptionGroupsPayload,
      });
      if (rpcError) throw rpcError;

      const { data, error } = await client
        .from('menu_items')
        .select(MENU_ITEM_COLUMNS)
        .order('sort_order', { ascending: true })
        .returns<DbMenuItemRow[]>();
      if (error) throw error;
      if (previousUrls.length > 0) {
        await cleanupUnusedMenuImages(client, previousUrls).catch(() => undefined);
      }
      return (data ?? []).map(mapMenuItem);
    },

    async uploadMenuImage(accessToken, file) {
      const client = createUserRlsClient(accessToken);
      const objectPath = `items/${randomUUID()}.webp`;
      const { error } = await client.storage
        .from(MENU_IMAGES_BUCKET)
        .upload(objectPath, file.buffer, {
          contentType: file.contentType,
          cacheControl: '31536000',
          upsert: false,
        });
      if (error) throw error;
      return {
        path: objectPath,
        imageUrl: buildMenuImagePublicUrl(objectPath, config.supabaseUrl),
      };
    },

    async deleteUnusedMenuImage(accessToken, imageUrl) {
      const client = createUserRlsClient(accessToken);
      const removedCount = await cleanupUnusedMenuImages(client, [imageUrl], ['items/']);
      return removedCount > 0 ? 'deleted' : 'ignored';
    },

    async uploadStoreAsset(accessToken, file) {
      const client = createUserRlsClient(accessToken);
      const folder = getManagedAssetFolder(file.purpose);
      const objectPath = `${folder}/${randomUUID()}.webp`;
      const { error } = await client.storage
        .from(MENU_IMAGES_BUCKET)
        .upload(objectPath, file.buffer, {
          contentType: file.contentType,
          cacheControl: '31536000',
          upsert: false,
        });
      if (error) throw error;
      return {
        path: objectPath,
        imageUrl: buildMenuImagePublicUrl(objectPath, config.supabaseUrl),
      };
    },

    async deleteUnusedStoreAsset(accessToken, imageUrl) {
      const client = createUserRlsClient(accessToken);
      const removedCount = await cleanupUnusedMenuImages(
        client,
        [imageUrl],
        ['branding/', 'payment-qr/'],
      );
      return removedCount > 0 ? 'deleted' : 'ignored';
    },

    async updateStoreProfile(accessToken, patch, expectedVersion) {
      const client = createUserRlsClient(accessToken);
      const beforeRow = await fetchStoreSettingsRow(client);
      if (!beforeRow) {
        return { status: 'not_found' };
      }

      const nextPickupEnabled = patch.pickupEnabled ?? beforeRow.pickup_enabled;
      const nextDeliveryEnabled = patch.deliveryEnabled ?? beforeRow.delivery_enabled;
      const nextDineInEnabled = patch.dineInEnabled ?? beforeRow.dine_in_enabled;
      if (!nextPickupEnabled && !nextDeliveryEnabled && !nextDineInEnabled) {
        return { status: 'fulfillment_required' };
      }

      const nextOriginLat =
        patch.originCoords !== undefined
          ? patch.originCoords
            ? patch.originCoords.lat
            : null
          : beforeRow.origin_lat;
      const nextOriginLng =
        patch.originCoords !== undefined
          ? patch.originCoords
            ? patch.originCoords.lng
            : null
          : beforeRow.origin_lng;
      if (nextDeliveryEnabled && (nextOriginLat === null || nextOriginLng === null)) {
        return { status: 'origin_required_for_delivery' };
      }

      const updateColumns: Record<string, unknown> = {};
      if (patch.storeName !== undefined) updateColumns.store_name = patch.storeName;
      if (patch.branchLabel !== undefined) updateColumns.branch_label = patch.branchLabel;
      if (patch.monogram !== undefined) updateColumns.monogram = patch.monogram;
      if (patch.heroHeadline !== undefined) updateColumns.hero_headline = patch.heroHeadline;
      if (patch.heroSubtext !== undefined) updateColumns.hero_subtext = patch.heroSubtext;
      if (patch.heroBadgeLabel !== undefined) updateColumns.hero_badge_label = patch.heroBadgeLabel;
      if (patch.address !== undefined) updateColumns.address = patch.address;
      if (patch.landmark !== undefined) updateColumns.landmark = patch.landmark;
      if (patch.contactPhone !== undefined) updateColumns.contact_phone = patch.contactPhone;
      if (patch.hoursText !== undefined) updateColumns.hours_text = patch.hoursText;
      if (patch.pickupSpotLabel !== undefined) {
        updateColumns.pickup_spot_label = patch.pickupSpotLabel;
      }
      if (patch.logoUrl !== undefined) updateColumns.logo_url = patch.logoUrl;
      if (patch.heroImageUrl !== undefined) updateColumns.hero_image_url = patch.heroImageUrl;
      if (patch.externalLinks !== undefined) updateColumns.external_links = patch.externalLinks;
      if (patch.queuePrefix !== undefined) updateColumns.queue_prefix = patch.queuePrefix;
      if (patch.preparingStageLabel !== undefined) {
        updateColumns.preparing_stage_label = patch.preparingStageLabel;
      }
      if (patch.themeAccentPreset !== undefined) {
        updateColumns.theme_accent_preset = patch.themeAccentPreset;
      }
      if (patch.themeAccentHex !== undefined) {
        updateColumns.theme_accent_hex = patch.themeAccentHex;
      }
      if (patch.acceptingOrders !== undefined) {
        updateColumns.accepting_orders = patch.acceptingOrders;
      }
      if (patch.closedNotice !== undefined) updateColumns.closed_notice = patch.closedNotice;
      if (patch.pickupEnabled !== undefined) updateColumns.pickup_enabled = patch.pickupEnabled;
      if (patch.deliveryEnabled !== undefined) {
        updateColumns.delivery_enabled = patch.deliveryEnabled;
      }
      if (patch.dineInEnabled !== undefined) updateColumns.dine_in_enabled = patch.dineInEnabled;
      if (patch.dineInTableRequired !== undefined) {
        updateColumns.dine_in_table_required = patch.dineInTableRequired;
      }
      if (patch.paymentMethods !== undefined) {
        updateColumns.payment_methods = patch.paymentMethods;
      }
      if (patch.originCoords !== undefined) {
        updateColumns.origin_lat = patch.originCoords ? patch.originCoords.lat : null;
        updateColumns.origin_lng = patch.originCoords ? patch.originCoords.lng : null;
      }

      let updateQuery = client.from('store_settings').update(updateColumns).eq('id', 1);
      if (expectedVersion !== undefined) {
        updateQuery = updateQuery.eq('version', expectedVersion);
      }

      const { data, error } = await updateQuery
        .select(STORE_SETTINGS_COLUMNS)
        .maybeSingle<DbStoreSettingsRow>();
      if (error) {
        if (error.code === '23514') {
          const msg = error.message ?? '';
          if (msg.includes('store_settings_delivery_requires_origin_check')) {
            return { status: 'origin_required_for_delivery' };
          }
          if (msg.includes('store_settings_fulfillment_enabled_check')) {
            return { status: 'fulfillment_required' };
          }
        }
        throw error;
      }

      if (data) {
        const replacedBrandingUrls: string[] = [];
        if (beforeRow.logo_url && beforeRow.logo_url !== data.logo_url) {
          replacedBrandingUrls.push(beforeRow.logo_url);
        }
        if (beforeRow.hero_image_url && beforeRow.hero_image_url !== data.hero_image_url) {
          replacedBrandingUrls.push(beforeRow.hero_image_url);
        }
        if (replacedBrandingUrls.length > 0) {
          await cleanupUnusedMenuImages(client, replacedBrandingUrls, ['branding/']).catch(
            () => undefined,
          );
        }

        const beforeQrUrls = extractPaymentMethodQrUrls(beforeRow.payment_methods);
        const afterQrUrls = new Set(extractPaymentMethodQrUrls(data.payment_methods));
        const replacedQrUrls = beforeQrUrls.filter((url) => !afterQrUrls.has(url));
        if (replacedQrUrls.length > 0) {
          await cleanupUnusedMenuImages(client, replacedQrUrls, ['payment-qr/']).catch(
            () => undefined,
          );
        }
        return { status: 'ok', data: mapStoreProfile(data) };
      }

      const current = await fetchStoreSettingsRow(client);
      if (!current) return { status: 'not_found' };
      return { status: 'conflict', latest: mapStoreProfile(current) };
    },

    async updateStoreOrderingStatus(accessToken, patch, expectedVersion) {
      const client = createUserRlsClient(accessToken);
      const updateColumns: {
        accepting_orders: boolean;
        closed_notice?: string;
      } = {
        accepting_orders: patch.acceptingOrders,
      };
      if (patch.closedNotice !== undefined) {
        updateColumns.closed_notice = patch.closedNotice;
      }

      let updateQuery = client.from('store_settings').update(updateColumns).eq('id', 1);
      if (expectedVersion !== undefined) {
        updateQuery = updateQuery.eq('version', expectedVersion);
      }

      const { data, error } = await updateQuery
        .select(STORE_SETTINGS_COLUMNS)
        .maybeSingle<DbStoreSettingsRow>();
      if (error) throw error;
      if (data) {
        return { status: 'ok', data: mapStoreProfile(data) };
      }

      const current = await fetchStoreSettingsRow(client);
      if (!current) return { status: 'not_found' };
      return { status: 'conflict', latest: mapStoreProfile(current) };
    },

    async updateDeliveryPricing(accessToken, patch, expectedVersion) {
      const client = createUserRlsClient(accessToken);
      if (patch.deliveryEnabled !== undefined) {
        const currentRow = await fetchStoreSettingsRow(client);
        if (!currentRow) return { status: 'not_found' };
        if (
          patch.deliveryEnabled === true &&
          (currentRow.origin_lat === null || currentRow.origin_lng === null)
        ) {
          return { status: 'origin_required_for_delivery' };
        }
        if (
          patch.deliveryEnabled === false &&
          !currentRow.pickup_enabled &&
          !currentRow.dine_in_enabled
        ) {
          return { status: 'fulfillment_required' };
        }
      }

      const updateColumns: {
        delivery_enabled?: boolean;
        delivery_base_fee_php?: number;
        delivery_per_km_rate_php?: number;
        delivery_max_distance_km?: number;
        free_delivery_min_subtotal_php?: number | null;
      } = {};
      if (patch.deliveryEnabled !== undefined) {
        updateColumns.delivery_enabled = patch.deliveryEnabled;
      }
      if (patch.baseFeePhp !== undefined) {
        updateColumns.delivery_base_fee_php = patch.baseFeePhp;
      }
      if (patch.perKmRatePhp !== undefined) {
        updateColumns.delivery_per_km_rate_php = patch.perKmRatePhp;
      }
      if (patch.maxDistanceKm !== undefined) {
        updateColumns.delivery_max_distance_km = Math.round(patch.maxDistanceKm * 10) / 10;
      }
      if (patch.freeDeliveryMinSubtotalPhp !== undefined) {
        updateColumns.free_delivery_min_subtotal_php = patch.freeDeliveryMinSubtotalPhp;
      }

      let updateQuery = client.from('store_settings').update(updateColumns).eq('id', 1);
      if (expectedVersion !== undefined) {
        updateQuery = updateQuery.eq('version', expectedVersion);
      }

      const { data, error } = await updateQuery
        .select(STORE_SETTINGS_COLUMNS)
        .maybeSingle<DbStoreSettingsRow>();
      if (error) {
        if (error.code === '23514') {
          const msg = error.message ?? '';
          if (msg.includes('store_settings_delivery_requires_origin_check')) {
            return { status: 'origin_required_for_delivery' };
          }
          if (msg.includes('store_settings_fulfillment_enabled_check')) {
            return { status: 'fulfillment_required' };
          }
        }
        throw error;
      }
      if (!data) {
        const current = await fetchDeliveryPricingWithClient(client);
        if (current.version === undefined) return { status: 'not_found' };
        return { status: 'conflict', latest: current };
      }
      return { status: 'ok', data: mapDeliveryPricing(data) };
    },

    async resetDeliveryPricing(accessToken) {
      const client = createUserRlsClient(accessToken);
      const currentRow = await fetchStoreSettingsRow(client);
      const hasOriginPin =
        currentRow !== null && currentRow.origin_lat !== null && currentRow.origin_lng !== null;

      const { data, error } = await client
        .from('store_settings')
        .update({
          delivery_enabled: hasOriginPin ? DEFAULT_DELIVERY_ENABLED : false,
          delivery_base_fee_php: DEFAULT_DELIVERY_BASE_FEE_PHP,
          delivery_per_km_rate_php: DEFAULT_DELIVERY_PER_KM_RATE_PHP,
          delivery_max_distance_km: DEFAULT_DELIVERY_MAX_DISTANCE_KM,
          free_delivery_min_subtotal_php: DEFAULT_FREE_DELIVERY_MIN_SUBTOTAL_PHP,
        })
        .eq('id', 1)
        .select(STORE_SETTINGS_COLUMNS)
        .single<DbStoreSettingsRow>();
      if (error) throw error;
      return mapDeliveryPricing(data);
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
        query = query.in('status', ['received', 'preparing', 'ready']);
      } else if (params.status && params.status !== 'all') {
        query = query.eq('status', params.status);
      }

      if (params.paymentStatus && params.paymentStatus !== 'all') {
        query = query.eq('payment_status', params.paymentStatus);
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

      const fetchStageCounts = async (): Promise<AdminOrderCounts> => {
        const { data: countsData, error: countsError } = await serviceClient.rpc(
          'get_admin_order_stage_counts',
          {
            p_since: rangeStartIso,
            p_query: params.q?.trim() || null,
            p_payment_status:
              params.paymentStatus && params.paymentStatus !== 'all' ? params.paymentStatus : null,
          },
        );
        if (countsError) throw countsError;
        const raw = (countsData ?? {}) as Partial<AdminOrderCounts>;
        const received = Number(raw.received ?? 0);
        const preparing = Number(raw.preparing ?? 0);
        const ready = Number(raw.ready ?? 0);
        const completed = Number(raw.completed ?? 0);
        const cancelled = Number(raw.cancelled ?? 0);
        const pendingVerification = Number(raw.pendingVerification ?? 0);
        return {
          all: Number(raw.all ?? received + preparing + ready + completed + cancelled),
          active: Number(raw.active ?? received + preparing + ready),
          received,
          preparing,
          ready,
          completed,
          cancelled,
          pendingVerification,
        };
      };

      const [rowsRes, counts] = await Promise.all([
        query.returns<DbOrderRow[]>(),
        params.cursor ? Promise.resolve(undefined) : fetchStageCounts(),
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

    async updateOrderPaymentStatus(accessToken, orderId, paymentStatus, expectedVersion) {
      if (!UUID_REGEX.test(orderId)) return { status: 'not_found' };
      const client = createUserRlsClient(accessToken);
      let updateQuery = client
        .from('orders')
        .update({ payment_status: paymentStatus })
        .eq('id', orderId);

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

    async listAdminUsers(accessToken) {
      const client = createUserRlsClient(accessToken);
      const { data, error } = await client
        .from('admin_users')
        .select(ADMIN_USER_COLUMNS)
        .order('created_at', { ascending: true })
        .returns<DbAdminUserRow[]>();
      if (error) throw error;
      return (data ?? []).map(mapAdminTeamMember);
    },

    async createAdminUser(accessToken, input) {
      const client = createUserRlsClient(accessToken);
      const normalizedEmail = input.email.trim().toLowerCase();

      const { data: existingRow, error: existingError } = await client
        .from('admin_users')
        .select('user_id')
        .ilike('email', normalizedEmail)
        .maybeSingle<{ user_id: string }>();
      if (existingError) throw existingError;
      if (existingRow) {
        return { status: 'email_exists' };
      }

      const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
        email: normalizedEmail,
        password: input.password,
        email_confirm: true,
      });

      if (authError || !authData.user) {
        const message = (authError?.message ?? '').toLowerCase();
        if (
          message.includes('already') ||
          message.includes('registered') ||
          message.includes('exists')
        ) {
          return { status: 'email_exists' };
        }
        throw authError ?? new Error('Failed to create Staff Portal auth user.');
      }

      const { data: inserted, error: insertError } = await client
        .from('admin_users')
        .insert({
          user_id: authData.user.id,
          email: normalizedEmail,
          role: input.role,
          active: true,
        })
        .select(ADMIN_USER_COLUMNS)
        .single<DbAdminUserRow>();

      if (insertError) {
        await serviceClient.auth.admin.deleteUser(authData.user.id).catch(() => undefined);
        if (insertError.code === '23505') {
          return { status: 'email_exists' };
        }
        throw insertError;
      }

      return { status: 'ok', member: mapAdminTeamMember(inserted) };
    },

    async updateAdminUser(accessToken, userId, input) {
      if (!UUID_REGEX.test(userId)) {
        return { status: 'not_found' };
      }
      const client = createUserRlsClient(accessToken);
      const { data: existing, error: fetchError } = await client
        .from('admin_users')
        .select(ADMIN_USER_COLUMNS)
        .eq('user_id', userId)
        .maybeSingle<DbAdminUserRow>();
      if (fetchError) throw fetchError;
      if (!existing) {
        return { status: 'not_found' };
      }

      const nextRole = input.role ?? existing.role;
      const nextActive = input.active ?? existing.active;
      if (existing.role === 'owner' && existing.active && (nextRole !== 'owner' || !nextActive)) {
        const { count, error: countError } = await client
          .from('admin_users')
          .select('user_id', { count: 'exact', head: true })
          .eq('role', 'owner')
          .eq('active', true)
          .neq('user_id', userId);
        if (countError) throw countError;
        if (!count || count < 1) {
          return { status: 'last_owner' };
        }
      }

      const { data: updated, error: updateError } = await client
        .from('admin_users')
        .update({ role: nextRole, active: nextActive })
        .eq('user_id', userId)
        .select(ADMIN_USER_COLUMNS)
        .maybeSingle<DbAdminUserRow>();
      if (updateError) {
        if (updateError.message?.includes('LAST_ACTIVE_OWNER')) {
          return { status: 'last_owner' };
        }
        throw updateError;
      }
      if (!updated) {
        return { status: 'not_found' };
      }
      return { status: 'ok', member: mapAdminTeamMember(updated) };
    },
  };
}
