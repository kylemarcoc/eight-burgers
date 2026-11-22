export const MENU_IMAGES_BUCKET = 'menu-images';
export const MENU_IMAGES_PUBLIC_PREFIX = `/storage/v1/object/public/${MENU_IMAGES_BUCKET}/`;

const MANAGED_OBJECT_PATH_REGEX =
  /^items\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i;

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
