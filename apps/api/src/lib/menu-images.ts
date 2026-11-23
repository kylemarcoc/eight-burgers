import type { AssetUploadPurpose } from '@menu-kiosk/contracts';

export const MENU_IMAGES_BUCKET = 'menu-images';
export const MENU_IMAGES_PUBLIC_PREFIX = `/storage/v1/object/public/${MENU_IMAGES_BUCKET}/`;

export type ManagedAssetFolder = 'items' | 'branding' | 'payment-qr';

const MANAGED_OBJECT_PATH_REGEX =
  /^(?:items|branding|payment-qr)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i;

export function getManagedAssetFolder(purpose: AssetUploadPurpose): ManagedAssetFolder {
  if (purpose === 'item') return 'items';
  if (purpose === 'payment-qr') return 'payment-qr';
  return 'branding';
}

function isLocalHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.protocol === 'http:' &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
    );
  } catch {
    return false;
  }
}

export function buildMenuImagePublicUrl(objectPath: string, supabaseUrl: string): string {
  const normalizedPath = objectPath.replace(/^\/+/, '');
  if (isLocalHttpUrl(supabaseUrl)) {
    return `${MENU_IMAGES_PUBLIC_PREFIX}${normalizedPath}`;
  }
  const normalizedBase = supabaseUrl.replace(/\/+$/, '');
  return `${normalizedBase}${MENU_IMAGES_PUBLIC_PREFIX}${normalizedPath}`;
}

export function buildManagedImageUrlVariants(objectPath: string, supabaseUrl: string): string[] {
  const normalizedPath = objectPath.replace(/^\/+/, '');
  const relativeUrl = `${MENU_IMAGES_PUBLIC_PREFIX}${normalizedPath}`;
  const normalizedBase = supabaseUrl.replace(/\/+$/, '');
  if (!normalizedBase) {
    return [relativeUrl];
  }
  const absoluteUrl = `${normalizedBase}${MENU_IMAGES_PUBLIC_PREFIX}${normalizedPath}`;
  return [relativeUrl, absoluteUrl];
}

export function extractManagedMenuImagePath(imageUrl: string, supabaseUrl: string): string | null {
  const trimmed = imageUrl.trim();
  if (!trimmed) return null;

  const withoutQueryOrHash = trimmed.split(/[?#]/)[0] ?? '';
  const normalizedBase = supabaseUrl.replace(/\/+$/, '');
  const absolutePrefix = `${normalizedBase}${MENU_IMAGES_PUBLIC_PREFIX}`;

  let candidate: string | null = null;
  if (withoutQueryOrHash.startsWith(MENU_IMAGES_PUBLIC_PREFIX)) {
    candidate = withoutQueryOrHash.slice(MENU_IMAGES_PUBLIC_PREFIX.length);
  } else if (withoutQueryOrHash.startsWith(absolutePrefix)) {
    candidate = withoutQueryOrHash.slice(absolutePrefix.length);
  }

  if (!candidate) return null;
  if (!MANAGED_OBJECT_PATH_REGEX.test(candidate)) return null;
  return candidate;
}

export function extractPaymentMethodQrUrls(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const urls: string[] = [];
  for (const value of Object.values(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const qrUrl = (value as { qrImageUrl?: unknown }).qrImageUrl;
    if (typeof qrUrl === 'string' && qrUrl.trim().length > 0) {
      urls.push(qrUrl.trim());
    }
  }
  return urls;
}

export function resolveUnreferencedManagedPaths(params: {
  candidateUrls: readonly string[];
  referencedUrls: readonly string[];
  supabaseUrl: string;
  allowedPrefixes?: readonly string[];
}): string[] {
  const { candidateUrls, referencedUrls, supabaseUrl, allowedPrefixes } = params;
  const candidatePaths = new Set<string>();
  for (const rawUrl of candidateUrls) {
    const objectPath = extractManagedMenuImagePath(rawUrl, supabaseUrl);
    if (!objectPath) continue;
    if (allowedPrefixes && !allowedPrefixes.some((prefix) => objectPath.startsWith(prefix))) {
      continue;
    }
    candidatePaths.add(objectPath);
  }
  if (candidatePaths.size === 0) return [];

  const referencedPaths = new Set<string>();
  for (const rawUrl of referencedUrls) {
    const objectPath = extractManagedMenuImagePath(rawUrl, supabaseUrl);
    if (objectPath) {
      referencedPaths.add(objectPath);
    }
  }

  return [...candidatePaths].filter((path) => !referencedPaths.has(path));
}
