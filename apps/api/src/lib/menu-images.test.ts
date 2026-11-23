import { MENU_IMAGE_MAX_UPLOAD_BYTES } from '@menu-kiosk/contracts';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { MenuImageOptimizationError, optimizeMenuImageToWebp } from './image-optimizer';
import {
  buildManagedImageUrlVariants,
  buildMenuImagePublicUrl,
  extractManagedMenuImagePath,
  extractPaymentMethodQrUrls,
  getManagedAssetFolder,
  resolveUnreferencedManagedPaths,
} from './menu-images';

describe('menu image URL helpers and sharp WebP optimizer', () => {
  it('maps upload purposes to managed storage folders', () => {
    expect(getManagedAssetFolder('item')).toBe('items');
    expect(getManagedAssetFolder('logo')).toBe('branding');
    expect(getManagedAssetFolder('hero')).toBe('branding');
    expect(getManagedAssetFolder('payment-qr')).toBe('payment-qr');
  });

  it('builds relative URLs for local HTTP Supabase and absolute HTTPS URLs for hosted Supabase', () => {
    const objectPath = 'items/11111111-2222-4333-8444-555555555555.webp';

    expect(buildMenuImagePublicUrl(objectPath, 'http://127.0.0.1:54321')).toBe(
      `/storage/v1/object/public/menu-images/${objectPath}`,
    );
    expect(buildMenuImagePublicUrl(objectPath, 'https://demo.supabase.co/')).toBe(
      `https://demo.supabase.co/storage/v1/object/public/menu-images/${objectPath}`,
    );
    expect(buildManagedImageUrlVariants(objectPath, 'https://demo.supabase.co/')).toEqual([
      `/storage/v1/object/public/menu-images/${objectPath}`,
      `https://demo.supabase.co/storage/v1/object/public/menu-images/${objectPath}`,
    ]);
  });

  it('extracts valid managed items/, branding/, and payment-qr/ paths and ignores seed/external/traversal URLs', () => {
    const itemPath = 'items/11111111-2222-4333-8444-555555555555.webp';
    const brandingPath = 'branding/22222222-3333-4444-8555-666666666666.webp';
    const qrPath = 'payment-qr/33333333-4444-4555-8666-777777777777.webp';
    const hosted = 'https://demo.supabase.co';

    expect(
      extractManagedMenuImagePath(`/storage/v1/object/public/menu-images/${itemPath}`, hosted),
    ).toBe(itemPath);
    expect(
      extractManagedMenuImagePath(
        `${hosted}/storage/v1/object/public/menu-images/${itemPath}?v=1`,
        hosted,
      ),
    ).toBe(itemPath);
    expect(
      extractManagedMenuImagePath(`/storage/v1/object/public/menu-images/${brandingPath}`, hosted),
    ).toBe(brandingPath);
    expect(
      extractManagedMenuImagePath(
        `${hosted}/storage/v1/object/public/menu-images/${qrPath}`,
        hosted,
      ),
    ).toBe(qrPath);

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

  it('prevents deleting active assets across relative and absolute URL forms and enforces allowed prefixes', () => {
    const hosted = 'https://demo.supabase.co';
    const activeBrandingPath = 'branding/11111111-2222-4333-8444-555555555555.webp';
    const orphanBrandingPath = 'branding/22222222-3333-4444-8555-666666666666.webp';
    const activeItemPath = 'items/33333333-4444-4555-8666-777777777777.webp';

    const removable = resolveUnreferencedManagedPaths({
      candidateUrls: [
        `${hosted}/storage/v1/object/public/menu-images/${activeBrandingPath}`,
        `/storage/v1/object/public/menu-images/${orphanBrandingPath}`,
        `/storage/v1/object/public/menu-images/${activeItemPath}`,
      ],
      referencedUrls: [
        // Referenced via relative URL while candidate used absolute URL
        `/storage/v1/object/public/menu-images/${activeBrandingPath}`,
        // Referenced via absolute URL while candidate used relative URL
        `${hosted}/storage/v1/object/public/menu-images/${activeItemPath}`,
      ],
      supabaseUrl: hosted,
    });
    expect(removable).toEqual([orphanBrandingPath]);

    // Prefix filter skips items/ when cleaning store assets
    const filtered = resolveUnreferencedManagedPaths({
      candidateUrls: [`/storage/v1/object/public/menu-images/${activeItemPath}`],
      referencedUrls: [],
      supabaseUrl: hosted,
      allowedPrefixes: ['branding/', 'payment-qr/'],
    });
    expect(filtered).toEqual([]);

    // Active payment_methods.*.qrImageUrl assets are preserved across relative and absolute URL forms
    const activeQrPath = 'payment-qr/44444444-5555-4666-8777-888888888888.webp';
    const orphanQrPath = 'payment-qr/55555555-6666-4777-8888-999999999999.webp';
    const paymentMethodsQrUrls = extractPaymentMethodQrUrls({
      cash: { enabled: true, qrImageUrl: '' },
      gcash: {
        enabled: true,
        qrImageUrl: `${hosted}/storage/v1/object/public/menu-images/${activeQrPath}`,
      },
      maya: { enabled: false, qrImageUrl: '' },
      bank_transfer: { enabled: false, qrImageUrl: '' },
    });
    expect(paymentMethodsQrUrls).toEqual([
      `${hosted}/storage/v1/object/public/menu-images/${activeQrPath}`,
    ]);
    expect(
      resolveUnreferencedManagedPaths({
        candidateUrls: [
          `/storage/v1/object/public/menu-images/${activeQrPath}`,
          `/storage/v1/object/public/menu-images/${orphanQrPath}`,
        ],
        referencedUrls: paymentMethodsQrUrls,
        supabaseUrl: hosted,
        allowedPrefixes: ['branding/', 'payment-qr/'],
      }),
    ).toEqual([orphanQrPath]);
  });

  it('optimizes images with purpose-specific dimensions and lossless WebP for payment-qr', async () => {
    const largePng = await sharp({
      create: {
        width: 2000,
        height: 1500,
        channels: 3,
        background: { r: 210, g: 120, b: 40 },
      },
    })
      .png()
      .toBuffer();

    const itemOptimized = await optimizeMenuImageToWebp(new Uint8Array(largePng), 'item');
    expect(itemOptimized.contentType).toBe('image/webp');
    expect(itemOptimized.width).toBe(1200);
    expect(itemOptimized.height).toBe(900);
    expect(itemOptimized.sizeBytes).toBeGreaterThan(0);

    const logoOptimized = await optimizeMenuImageToWebp(new Uint8Array(largePng), 'logo');
    expect(logoOptimized.width).toBe(512);
    expect(logoOptimized.height).toBe(384);

    const heroOptimized = await optimizeMenuImageToWebp(new Uint8Array(largePng), 'hero');
    expect(heroOptimized.width).toBe(1200);
    expect(heroOptimized.height).toBe(900);

    const wideHeroPng = await sharp({
      create: {
        width: 2400,
        height: 1200,
        channels: 3,
        background: { r: 40, g: 60, b: 80 },
      },
    })
      .png()
      .toBuffer();
    const wideHeroOptimized = await optimizeMenuImageToWebp(new Uint8Array(wideHeroPng), 'hero');
    expect(wideHeroOptimized.width).toBe(1600);
    expect(wideHeroOptimized.height).toBe(800);

    // High-contrast 2-color QR-like pattern preserves exact pixel values with lossless WebP
    const qrRaw = Buffer.alloc(16 * 16 * 3);
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const idx = (y * 16 + x) * 3;
        const val = (x + y) % 2 === 0 ? 0 : 255;
        qrRaw[idx] = val;
        qrRaw[idx + 1] = val;
        qrRaw[idx + 2] = val;
      }
    }
    const qrPng = await sharp(qrRaw, { raw: { width: 16, height: 16, channels: 3 } })
      .png()
      .toBuffer();
    const qrOptimized = await optimizeMenuImageToWebp(new Uint8Array(qrPng), 'payment-qr');
    expect(qrOptimized.width).toBe(16);
    expect(qrOptimized.height).toBe(16);
    const decodedQr = await sharp(qrOptimized.buffer).raw().toBuffer();
    expect(Buffer.compare(decodedQr, qrRaw)).toBe(0);

    const outMeta = await sharp(itemOptimized.buffer).metadata();
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
