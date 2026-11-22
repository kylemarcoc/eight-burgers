import { MENU_IMAGE_MAX_UPLOAD_BYTES } from '@eight-burgers/contracts';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { MenuImageOptimizationError, optimizeMenuImageToWebp } from './image-optimizer';
import { buildMenuImagePublicUrl, extractManagedMenuImagePath } from './menu-images';

describe('menu image URL helpers and sharp WebP optimizer', () => {
  it('builds relative URLs for local HTTP Supabase and absolute HTTPS URLs for hosted Supabase', () => {
    const objectPath = 'items/11111111-2222-4333-8444-555555555555.webp';

    expect(buildMenuImagePublicUrl(objectPath, 'http://127.0.0.1:54321')).toBe(
      `/storage/v1/object/public/menu-images/${objectPath}`,
    );
    expect(buildMenuImagePublicUrl(objectPath, 'https://demo.supabase.co/')).toBe(
      `https://demo.supabase.co/storage/v1/object/public/menu-images/${objectPath}`,
    );
  });

  it('extracts only valid managed menu-images paths and ignores seed/external/traversal URLs', () => {
    const objectPath = 'items/11111111-2222-4333-8444-555555555555.webp';
    const hosted = 'https://demo.supabase.co';

    expect(
      extractManagedMenuImagePath(`/storage/v1/object/public/menu-images/${objectPath}`, hosted),
    ).toBe(objectPath);
    expect(
      extractManagedMenuImagePath(
        `${hosted}/storage/v1/object/public/menu-images/${objectPath}?v=1`,
        hosted,
      ),
    ).toBe(objectPath);

    expect(extractManagedMenuImagePath('/images/menu/burger-deluxe.webp', hosted)).toBeNull();
    expect(extractManagedMenuImagePath('https://cdn.example.com/burger.webp', hosted)).toBeNull();
    expect(
      extractManagedMenuImagePath(
        '/storage/v1/object/public/menu-images/items/../../secret.webp',
        hosted,
      ),
    ).toBeNull();
    expect(
      extractManagedMenuImagePath('/storage/v1/object/public/menu-images/other/file.webp', hosted),
    ).toBeNull();
  });

  it('converts oversized PNGs to resized WebP and rejects invalid, SVG, or >5MB uploads', async () => {
    const largePng = await sharp({
      create: {
        width: 1600,
        height: 1200,
        channels: 3,
        background: { r: 210, g: 120, b: 40 },
      },
    })
      .png()
      .toBuffer();

    const optimized = await optimizeMenuImageToWebp(new Uint8Array(largePng));
    expect(optimized.contentType).toBe('image/webp');
    expect(optimized.width).toBe(1200);
    expect(optimized.height).toBe(900);
    expect(optimized.sizeBytes).toBeGreaterThan(0);

    const outMeta = await sharp(optimized.buffer).metadata();
    expect(outMeta.format).toBe('webp');

    await expect(optimizeMenuImageToWebp(new Uint8Array(0))).rejects.toMatchObject({
      code: 'EMPTY_FILE',
      status: 400,
    } satisfies Partial<MenuImageOptimizationError>);

    await expect(
      optimizeMenuImageToWebp(new Uint8Array(MENU_IMAGE_MAX_UPLOAD_BYTES + 1)),
    ).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
      status: 413,
    } satisfies Partial<MenuImageOptimizationError>);

    const svgBytes = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
    );
    await expect(optimizeMenuImageToWebp(svgBytes)).rejects.toMatchObject({
      code: 'UNSUPPORTED_IMAGE',
      status: 415,
    } satisfies Partial<MenuImageOptimizationError>);

    const corruptBytes = new TextEncoder().encode('not-an-image');
    await expect(optimizeMenuImageToWebp(corruptBytes)).rejects.toMatchObject({
      code: 'INVALID_IMAGE',
      status: 400,
    } satisfies Partial<MenuImageOptimizationError>);
  });
});
