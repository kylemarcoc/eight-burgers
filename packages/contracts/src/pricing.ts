import {
  DEFAULT_DELIVERY_PRICING,
  ROAD_DISTANCE_FACTOR,
  type DeliveryPricingConfig,
  type GeoCoordinates,
} from './delivery.schema';
import {
  DEFAULT_OPTION_GROUPS,
  SLUG_ID_REGEX,
  isSafeImageUrl,
  type MenuItem,
  type MenuItemInput,
  type OptionChoice,
  type OptionGroup,
} from './menu.schema';
import {
  ITEM_NOTE_MAX_LENGTH,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  type CartLineItem,
  type FulfillmentMode,
  type OrderRecord,
  type SelectedOptionSnapshot,
} from './order.schema';

export type DeliveryFeeQuote = {
  baseFeePhp: number;
  perKmRatePhp: number;
  distanceFeePhp: number;
  subtotalFeePhp: number;
  feePhp: number;
  etaMinutes: string | null;
  isFreeDelivery: boolean;
  amountToFreeDeliveryPhp: number | null;
  freeDeliveryMinSubtotalPhp: number | null;
  distanceKm: number | null;
  maxDeliveryDistanceKm: number | null;
  outOfRange: boolean;
  available: boolean;
};

export type OptionValidationIssueCode =
  | 'INVALID_OPTION_SELECTION'
  | 'OPTION_UNAVAILABLE'
  | 'REQUIRED_OPTION_MISSING'
  | 'OPTION_LIMIT_EXCEEDED';

export type OptionValidationIssue = {
  code: OptionValidationIssueCode;
  groupId?: string;
  choiceId?: string;
  message: string;
};

export type ItemOptionValidationResult = {
  valid: boolean;
  selectedOptions: SelectedOptionSnapshot[];
  addonsPricePhp: number;
  issues: OptionValidationIssue[];
  invalidChoiceIds: string[];
  unavailableChoiceIds: string[];
  missingRequiredGroupIds: string[];
  overLimitGroupIds: string[];
};

export type MenuItemDisplayPrice = {
  pricePhp: number;
  isFromPrice: boolean;
};

export type ResolvedCartLine = {
  lineId: string;
  item: MenuItem;
  quantity: number;
  selectedOptionIds: string[];
  selectedOptions: SelectedOptionSnapshot[];
  itemNote: string;
  addonsPricePhp: number;
  unitWithAddonsPhp: number;
  lineTotalPhp: number;
  optionIssues: OptionValidationIssue[];
  hasInvalidOptions: boolean;
};

export type CartSummary = {
  lines: ResolvedCartLine[];
  unavailableLineIds: string[];
  invalidOptionLineIds: string[];
  removedLineIds: string[];
  totalItems: number;
  subtotalPhp: number;
};

export function formatPhp(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `₱${safe.toLocaleString('en-PH')}`;
}

export function isValidCoordinates(value: unknown): value is GeoCoordinates {
  if (!value || typeof value !== 'object') return false;
  const coords = value as Partial<GeoCoordinates>;
  return (
    typeof coords.lat === 'number' &&
    typeof coords.lng === 'number' &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    coords.lat >= -90 &&
    coords.lat <= 90 &&
    coords.lng >= -180 &&
    coords.lng <= 180
  );
}

export function estimateRoadDistanceKm(from: GeoCoordinates, to: GeoCoordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightKm = earthRadiusKm * c;
  return Math.round(straightKm * ROAD_DISTANCE_FACTOR * 10) / 10;
}

export function estimateDeliveryFeePhp(
  distanceKm: number,
  baseFeePhp: number,
  perKmRatePhp: number,
): number {
  const safeBase = Number.isFinite(baseFeePhp) ? Math.max(0, Math.round(baseFeePhp)) : 0;
  const safeRate = Number.isFinite(perKmRatePhp) ? Math.max(0, Math.round(perKmRatePhp)) : 0;
  const safeDistTenths = Number.isFinite(distanceKm) ? Math.max(0, Math.round(distanceKm * 10)) : 0;
  const distanceFee = Math.floor((safeDistTenths * safeRate + 5) / 10);
  return safeBase + distanceFee;
}

export function estimateDeliveryEtaMinutes(distanceKm: number): string {
  const safeDistTenths = Number.isFinite(distanceKm) ? Math.max(0, Math.round(distanceKm * 10)) : 0;
  const rawMin = 15 + Math.floor((safeDistTenths * 2 + 5) / 10);
  const etaMin = Math.floor((rawMin + 2) / 5) * 5;
  const spread = safeDistTenths > 100 ? 15 : 10;
  return `${etaMin}–${etaMin + spread} min`;
}

export function buildGoogleMapsPinUrl(pin: GeoCoordinates): string {
  return `https://maps.google.com/?q=${pin.lat.toFixed(5)},${pin.lng.toFixed(5)}`;
}

export type FormatOrderShareTextOptions = {
  storeName?: string;
  pickupLabel?: string;
};

export function formatOrderShareText(
  order: OrderRecord,
  options: FormatOrderShareTextOptions = {},
): string {
  const storeName = options.storeName?.trim() || 'Shop';
  const pickupLabel = options.pickupLabel?.trim() || 'Counter Pickup';
  const deliveryDetailsParts: string[] = [];
  if (typeof order.deliveryDistanceKm === 'number' && Number.isFinite(order.deliveryDistanceKm)) {
    deliveryDetailsParts.push(`~${order.deliveryDistanceKm.toFixed(1)} km`);
  }
  if (order.deliveryEtaMinutes) {
    deliveryDetailsParts.push(order.deliveryEtaMinutes);
  }
  const deliverySummary =
    order.fulfillment === 'delivery' && deliveryDetailsParts.length > 0
      ? ` (${deliveryDetailsParts.join(' · ')})`
      : '';
  const trimmedTable = order.tableNumber?.trim();
  const fulfillmentLabel =
    order.fulfillment === 'pickup'
      ? pickupLabel
      : order.fulfillment === 'dine-in'
        ? trimmedTable
          ? `Dine-in (Table ${trimmedTable})`
          : 'Dine-in'
        : `Delivery${deliverySummary}`;
  const paymentMethodLabel = PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod;
  const paymentStatusSuffix =
    order.paymentStatus && order.paymentStatus !== 'unpaid'
      ? ` (${PAYMENT_STATUS_LABELS[order.paymentStatus]})`
      : '';
  const trimmedPaymentRef = order.paymentReference?.trim();
  const deliveryFeeLine =
    order.deliveryFeePhp > 0
      ? [`Delivery fee: ${formatPhp(order.deliveryFeePhp)}`]
      : order.fulfillment === 'delivery' && order.deliveryFeeWaived
        ? ['Delivery fee: Free (min. order met)']
        : [];
  const itemLines: string[] = [];
  for (const line of order.lines) {
    const optionNames =
      line.selectedOptions && line.selectedOptions.length > 0
        ? line.selectedOptions.map((option) => option.choiceName)
        : line.addonNames;
    const optionsText = optionNames.length > 0 ? ` (+ ${optionNames.join(', ')})` : '';
    itemLines.push(
      `- ${line.quantity}x ${line.name}${optionsText} — ${formatPhp(line.lineTotalPhp)}`,
    );
    const trimmedNote = line.itemNote?.trim();
    if (trimmedNote) {
      itemLines.push(`  Note: ${trimmedNote}`);
    }
  }
  const lines = [
    `${storeName} Order ${order.queueNumber}`,
    `Guest: ${order.customerName}`,
    ...(order.contactNumber ? [`Mobile: ${order.contactNumber}`] : []),
    `Fulfillment: ${fulfillmentLabel}`,
    ...(order.addressOrNotes ? [`Details: ${order.addressOrNotes}`] : []),
    ...(order.fulfillment === 'delivery' && isValidCoordinates(order.deliveryPin)
      ? [`Map Pin: ${buildGoogleMapsPinUrl(order.deliveryPin)}`]
      : []),
    `Payment: ${paymentMethodLabel}${paymentStatusSuffix}`,
    ...(trimmedPaymentRef ? [`Payment Ref: ${trimmedPaymentRef}`] : []),
    '',
    'Items:',
    ...itemLines,
    '',
    `Subtotal: ${formatPhp(order.subtotalPhp)}`,
    ...deliveryFeeLine,
    `Total Due: ${formatPhp(order.totalPhp)}`,
  ];
  return lines.join('\n');
}

export function normalizeSelectedOptionIds(selectedOptionIds?: readonly string[]): string[] {
  if (!selectedOptionIds || selectedOptionIds.length === 0) return [];
  const unique = new Set<string>();
  for (const rawId of selectedOptionIds) {
    const trimmed = rawId.trim();
    if (trimmed && SLUG_ID_REGEX.test(trimmed)) {
      unique.add(trimmed);
    }
  }
  return [...unique].sort();
}

export function normalizeItemNote(itemNote?: string | null): string {
  if (!itemNote) return '';
  return itemNote.trim().slice(0, ITEM_NOTE_MAX_LENGTH);
}

function hashItemNote(note: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < note.length; index += 1) {
    hash ^= note.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildCartLineId(
  itemId: string,
  selectedOptionIds?: readonly string[],
  itemNote?: string,
): string {
  const normalizedOptions = normalizeSelectedOptionIds(selectedOptionIds);
  const normalizedNote = normalizeItemNote(itemNote);
  const base = normalizedOptions.length > 0 ? `${itemId}__${normalizedOptions.join('+')}` : itemId;
  if (!normalizedNote) return base;
  return `${base}~${hashItemNote(normalizedNote)}`;
}

export function getActiveItemOptionGroups(
  item: Pick<MenuItem, 'optionGroupIds'>,
  optionGroups: readonly OptionGroup[],
): OptionGroup[] {
  if (item.optionGroupIds.length === 0 || optionGroups.length === 0) return [];
  const groupById = new Map<string, OptionGroup>(optionGroups.map((group) => [group.id, group]));
  const seen = new Set<string>();
  const resolved: OptionGroup[] = [];
  for (const groupId of item.optionGroupIds) {
    if (seen.has(groupId)) continue;
    seen.add(groupId);
    const group = groupById.get(groupId);
    if (group && group.active) {
      resolved.push(group);
    }
  }
  return resolved;
}

export function getDefaultSelectedOptionIds(
  item: Pick<MenuItem, 'optionGroupIds'>,
  optionGroups: readonly OptionGroup[],
): string[] {
  const activeGroups = getActiveItemOptionGroups(item, optionGroups);
  const defaults: string[] = [];
  for (const group of activeGroups) {
    const effectiveMax = group.selectionMode === 'single' ? 1 : group.maxSelect;
    const sortedChoices = [...group.choices].sort((a, b) => a.sortOrder - b.sortOrder);
    let picked = 0;
    for (const choice of sortedChoices) {
      if (!choice.available || !choice.isDefault) continue;
      if (effectiveMax !== null && picked >= effectiveMax) break;
      defaults.push(choice.id);
      picked += 1;
    }
  }
  return normalizeSelectedOptionIds(defaults);
}

export function validateItemOptionSelections(
  item: Pick<MenuItem, 'optionGroupIds'>,
  selectedOptionIds: readonly string[],
  optionGroups: readonly OptionGroup[],
): ItemOptionValidationResult {
  const activeGroups = getActiveItemOptionGroups(item, optionGroups);
  const normalizedRequested = normalizeSelectedOptionIds(selectedOptionIds);
  const choiceEntryById = new Map<string, { group: OptionGroup; choice: OptionChoice }>();
  for (const group of activeGroups) {
    for (const choice of group.choices) {
      choiceEntryById.set(choice.id, { group, choice });
    }
  }

  const issues: OptionValidationIssue[] = [];
  const invalidChoiceIds: string[] = [];
  const unavailableChoiceIds: string[] = [];
  const missingRequiredGroupIds: string[] = [];
  const overLimitGroupIds: string[] = [];
  const selectedByGroupId = new Map<string, OptionChoice[]>();
  const validAvailableChoiceIds = new Set<string>();

  for (const choiceId of normalizedRequested) {
    const entry = choiceEntryById.get(choiceId);
    if (!entry) {
      invalidChoiceIds.push(choiceId);
      issues.push({
        code: 'INVALID_OPTION_SELECTION',
        choiceId,
        message: `Option "${choiceId}" is no longer available for this item.`,
      });
      continue;
    }

    const list = selectedByGroupId.get(entry.group.id) ?? [];
    list.push(entry.choice);
    selectedByGroupId.set(entry.group.id, list);

    if (!entry.choice.available) {
      unavailableChoiceIds.push(choiceId);
      issues.push({
        code: 'OPTION_UNAVAILABLE',
        groupId: entry.group.id,
        choiceId,
        message: `"${entry.choice.name}" is currently sold out.`,
      });
      continue;
    }

    validAvailableChoiceIds.add(choiceId);
  }

  const selectedOptions: SelectedOptionSnapshot[] = [];
  let addonsPricePhp = 0;

  for (const group of activeGroups) {
    const groupSelected = selectedByGroupId.get(group.id) ?? [];
    const availableCount = groupSelected.filter((choice) => choice.available).length;
    const totalCount = groupSelected.length;
    const effectiveMin = group.required ? Math.max(1, group.minSelect) : group.minSelect;
    const effectiveMax = group.selectionMode === 'single' ? 1 : group.maxSelect;

    if (availableCount < effectiveMin) {
      missingRequiredGroupIds.push(group.id);
      issues.push({
        code: 'REQUIRED_OPTION_MISSING',
        groupId: group.id,
        message:
          effectiveMin === 1
            ? `Choose an option for ${group.name}.`
            : `Choose at least ${effectiveMin} options for ${group.name}.`,
      });
    }

    if (effectiveMax !== null && totalCount > effectiveMax) {
      overLimitGroupIds.push(group.id);
      issues.push({
        code: 'OPTION_LIMIT_EXCEEDED',
        groupId: group.id,
        message:
          effectiveMax === 1
            ? `Choose only 1 option for ${group.name}.`
            : `Choose at most ${effectiveMax} options for ${group.name}.`,
      });
    }

    const sortedChoices = [...group.choices].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const choice of sortedChoices) {
      if (!validAvailableChoiceIds.has(choice.id)) continue;
      selectedOptions.push({
        groupId: group.id,
        groupName: group.name,
        choiceId: choice.id,
        choiceName: choice.name,
        priceDeltaPhp: choice.priceDeltaPhp,
      });
      addonsPricePhp += choice.priceDeltaPhp;
    }
  }

  return {
    valid: issues.length === 0,
    selectedOptions,
    addonsPricePhp,
    issues,
    invalidChoiceIds,
    unavailableChoiceIds,
    missingRequiredGroupIds,
    overLimitGroupIds,
  };
}

export function isMenuItemOrderable(
  item: Pick<MenuItem, 'available' | 'optionGroupIds'>,
  optionGroups: readonly OptionGroup[],
): boolean {
  if (!item.available) return false;
  const activeGroups = getActiveItemOptionGroups(item, optionGroups);
  for (const group of activeGroups) {
    const effectiveMin = group.required ? Math.max(1, group.minSelect) : group.minSelect;
    if (effectiveMin <= 0) continue;
    const availableCount = group.choices.filter((choice) => choice.available).length;
    if (availableCount < effectiveMin) {
      return false;
    }
  }
  return true;
}

export function getMenuItemDisplayPrice(
  item: Pick<MenuItem, 'pricePhp' | 'optionGroupIds'>,
  optionGroups: readonly OptionGroup[],
): MenuItemDisplayPrice {
  const activeGroups = getActiveItemOptionGroups(item, optionGroups);
  let minRequiredDeltaPhp = 0;
  let isFromPrice = false;

  for (const group of activeGroups) {
    const effectiveMin = group.required ? Math.max(1, group.minSelect) : group.minSelect;
    if (effectiveMin <= 0) continue;

    const availableDeltas = group.choices
      .filter((choice) => choice.available)
      .map((choice) => Math.max(0, choice.priceDeltaPhp))
      .sort((a, b) => a - b);

    if (availableDeltas.length === 0) continue;

    const requiredSlice = availableDeltas.slice(0, Math.min(effectiveMin, availableDeltas.length));
    const groupMinDelta = requiredSlice.reduce((sum, delta) => sum + delta, 0);
    if (groupMinDelta > 0) {
      minRequiredDeltaPhp += groupMinDelta;
      isFromPrice = true;
    }
  }

  return {
    pricePhp: item.pricePhp + minRequiredDeltaPhp,
    isFromPrice,
  };
}

export function calculateCartDetails(
  cart: readonly CartLineItem[],
  menu: readonly MenuItem[],
  optionGroups: readonly OptionGroup[] = DEFAULT_OPTION_GROUPS,
): CartSummary {
  const menuMap = new Map<string, MenuItem>(menu.map((item) => [item.id, item]));
  const lines: ResolvedCartLine[] = [];
  const unavailableLineIds: string[] = [];
  const invalidOptionLineIds: string[] = [];
  const removedLineIds: string[] = [];
  let totalItems = 0;
  let subtotalPhp = 0;

  for (const cartLine of cart) {
    if (cartLine.quantity <= 0) {
      continue;
    }

    const item = menuMap.get(cartLine.itemId);
    if (!item) {
      removedLineIds.push(cartLine.lineId);
      continue;
    }

    if (!item.available) {
      unavailableLineIds.push(cartLine.lineId);
    }

    const normalizedOptionIds = normalizeSelectedOptionIds(cartLine.selectedOptionIds);
    const normalizedNote = normalizeItemNote(cartLine.itemNote);
    const validation = validateItemOptionSelections(item, normalizedOptionIds, optionGroups);

    if (!validation.valid) {
      invalidOptionLineIds.push(cartLine.lineId);
    }

    const unitWithAddonsPhp = item.pricePhp + validation.addonsPricePhp;
    const lineTotalPhp = unitWithAddonsPhp * cartLine.quantity;
    totalItems += cartLine.quantity;
    subtotalPhp += lineTotalPhp;

    lines.push({
      lineId: cartLine.lineId,
      item,
      quantity: cartLine.quantity,
      selectedOptionIds: normalizedOptionIds,
      selectedOptions: validation.selectedOptions,
      itemNote: normalizedNote,
      addonsPricePhp: validation.addonsPricePhp,
      unitWithAddonsPhp,
      lineTotalPhp,
      optionIssues: validation.issues,
      hasInvalidOptions: !validation.valid,
    });
  }

  return {
    lines,
    unavailableLineIds,
    invalidOptionLineIds,
    removedLineIds,
    totalItems,
    subtotalPhp,
  };
}

function slugifyWithMaxLength(
  name: string,
  fallback: string,
  existingIds: ReadonlySet<string>,
  maxLength = 120,
): string {
  const rawBase =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback;
  const base = rawBase.slice(0, maxLength).replace(/-+$/, '') || fallback;
  if (!existingIds.has(base)) return base;
  let suffix = 2;
  while (true) {
    const suffixText = `-${suffix}`;
    const trimmedBase = base
      .slice(0, Math.max(1, maxLength - suffixText.length))
      .replace(/-+$/, '');
    const candidate = `${trimmedBase || fallback.slice(0, maxLength - suffixText.length)}${suffixText}`;
    if (!existingIds.has(candidate)) return candidate;
    suffix += 1;
  }
}

export function slugifyMenuId(name: string, existingIds: ReadonlySet<string>): string {
  return slugifyWithMaxLength(name, 'menu-item', existingIds, 120);
}

export function slugifyCategoryId(name: string, existingIds: ReadonlySet<string>): string {
  return slugifyWithMaxLength(name, 'category', existingIds, 80);
}

export function slugifyOptionGroupId(name: string, existingIds: ReadonlySet<string>): string {
  return slugifyWithMaxLength(name, 'option-group', existingIds, 80);
}

export function slugifyOptionChoiceId(name: string, existingIds: ReadonlySet<string>): string {
  return slugifyWithMaxLength(name, 'option', existingIds, 80);
}

export function sanitizeMenuItemInput(
  input: MenuItemInput,
  fallbackCategoryId = 'uncategorized',
): MenuItemInput {
  const numericPrice = Number(input.pricePhp);
  const pricePhp =
    Number.isFinite(numericPrice) && numericPrice > 0 ? Math.round(numericPrice) : 99;
  const trimmedCategory = input.category.trim();
  const category =
    trimmedCategory && trimmedCategory.length <= 80 && SLUG_ID_REGEX.test(trimmedCategory)
      ? trimmedCategory
      : fallbackCategoryId;
  const trimmedImageUrl = input.imageUrl.trim();
  const seenGroups = new Set<string>();
  const optionGroupIds: string[] = [];
  for (const rawGroupId of input.optionGroupIds) {
    const trimmed = rawGroupId.trim();
    if (
      trimmed &&
      trimmed.length <= 80 &&
      SLUG_ID_REGEX.test(trimmed) &&
      !seenGroups.has(trimmed)
    ) {
      seenGroups.add(trimmed);
      optionGroupIds.push(trimmed);
    }
  }
  return {
    name: input.name.trim() || 'Menu Item',
    category,
    pricePhp,
    specLabel: input.specLabel.trim() || 'Regular',
    description: input.description.trim() || 'Freshly prepared to order.',
    imageUrl: isSafeImageUrl(trimmedImageUrl) ? trimmedImageUrl : '',
    available: Boolean(input.available),
    featured: Boolean(input.featured),
    optionGroupIds,
  };
}

export function createDefaultDeliveryPricing(): DeliveryPricingConfig {
  return {
    ...DEFAULT_DELIVERY_PRICING,
    originCoords: DEFAULT_DELIVERY_PRICING.originCoords
      ? { ...DEFAULT_DELIVERY_PRICING.originCoords }
      : null,
  };
}

export function normalizeFreeDeliveryThreshold(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric);
}

export function calculateDeliveryQuote(params: {
  fulfillment: FulfillmentMode;
  subtotalPhp: number;
  deliveryPricing: DeliveryPricingConfig;
  pin?: GeoCoordinates | null;
  storeOrigin?: GeoCoordinates | null;
}): DeliveryFeeQuote {
  const threshold = normalizeFreeDeliveryThreshold(
    params.deliveryPricing.freeDeliveryMinSubtotalPhp,
  );
  const safeSubtotal = Number.isFinite(params.subtotalPhp) ? Math.max(0, params.subtotalPhp) : 0;
  const baseFeePhp = Number.isFinite(params.deliveryPricing.baseFeePhp)
    ? Math.max(0, Math.round(params.deliveryPricing.baseFeePhp))
    : 0;
  const perKmRatePhp = Number.isFinite(params.deliveryPricing.perKmRatePhp)
    ? Math.max(0, Math.round(params.deliveryPricing.perKmRatePhp))
    : 0;
  const maxDeliveryDistanceKm =
    Number.isFinite(params.deliveryPricing.maxDistanceKm) &&
    params.deliveryPricing.maxDistanceKm > 0
      ? Math.round(params.deliveryPricing.maxDistanceKm * 10) / 10
      : null;

  if (params.fulfillment !== 'delivery') {
    return {
      baseFeePhp: 0,
      perKmRatePhp: 0,
      distanceFeePhp: 0,
      subtotalFeePhp: 0,
      feePhp: 0,
      etaMinutes: null,
      isFreeDelivery: false,
      amountToFreeDeliveryPhp: null,
      freeDeliveryMinSubtotalPhp: threshold,
      distanceKm: null,
      maxDeliveryDistanceKm: null,
      outOfRange: false,
      available: true,
    };
  }

  const origin =
    params.storeOrigin !== undefined ? params.storeOrigin : params.deliveryPricing.originCoords;

  if (
    !params.deliveryPricing.deliveryEnabled ||
    maxDeliveryDistanceKm === null ||
    !isValidCoordinates(origin)
  ) {
    return {
      baseFeePhp,
      perKmRatePhp,
      distanceFeePhp: 0,
      subtotalFeePhp: 0,
      feePhp: 0,
      etaMinutes: null,
      isFreeDelivery: false,
      amountToFreeDeliveryPhp: null,
      freeDeliveryMinSubtotalPhp: threshold,
      distanceKm: null,
      maxDeliveryDistanceKm: null,
      outOfRange: false,
      available: false,
    };
  }

  const distanceKm = isValidCoordinates(params.pin)
    ? estimateRoadDistanceKm(origin, params.pin)
    : null;

  if (distanceKm !== null && distanceKm > maxDeliveryDistanceKm) {
    return {
      baseFeePhp,
      perKmRatePhp,
      distanceFeePhp: 0,
      subtotalFeePhp: 0,
      feePhp: 0,
      etaMinutes: null,
      isFreeDelivery: false,
      amountToFreeDeliveryPhp: null,
      freeDeliveryMinSubtotalPhp: threshold,
      distanceKm,
      maxDeliveryDistanceKm,
      outOfRange: true,
      available: false,
    };
  }

  const subtotalFeePhp =
    distanceKm !== null ? estimateDeliveryFeePhp(distanceKm, baseFeePhp, perKmRatePhp) : baseFeePhp;
  const distanceFeePhp = Math.max(0, subtotalFeePhp - baseFeePhp);
  const etaMinutes = distanceKm !== null ? estimateDeliveryEtaMinutes(distanceKm) : null;
  const isFreeDelivery = threshold !== null && safeSubtotal >= threshold && subtotalFeePhp > 0;
  const feePhp = isFreeDelivery ? 0 : subtotalFeePhp;
  const amountToFreeDeliveryPhp =
    threshold !== null && safeSubtotal < threshold ? threshold - safeSubtotal : null;

  return {
    baseFeePhp,
    perKmRatePhp,
    distanceFeePhp,
    subtotalFeePhp,
    feePhp,
    etaMinutes,
    isFreeDelivery,
    amountToFreeDeliveryPhp,
    freeDeliveryMinSubtotalPhp: threshold,
    distanceKm,
    maxDeliveryDistanceKm,
    outOfRange: false,
    available: true,
  };
}
