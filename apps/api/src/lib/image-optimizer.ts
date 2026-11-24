import { MENU_IMAGE_MAX_UPLOAD_BYTES, type AssetUploadPurpose } from '@menu-kiosk/contracts';
import sharp, { type Metadata } from 'sharp';

const ALLOWED_INPUT_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif']);
const MAX_INPUT_PIXELS = 25_000_000;

type ImageOptimizationProfile =
  | {
      maxWidth: number;
      maxHeight: number;
      lossless: true;
    }
  | {
      maxWidth: number;
      maxHeight: number;
      lossless: false;
      quality: number;
    };

const OPTIMIZATION_PROFILES: Record<AssetUploadPurpose, ImageOptimizationProfile> = {
  item: { maxWidth: 1200, maxHeight: 900, lossless: false, quality: 82 },
  logo: { maxWidth: 512, maxHeight: 512, lossless: false, quality: 90 },
  hero: { maxWidth: 1600, maxHeight: 900, lossless: false, quality: 84 },
  'payment-qr': { maxWidth: 800, maxHeight: 800, lossless: true },
};

export type OptimizedMenuImage = {
  buffer: Uint8Array;
  width: number;
  height: number;
  sizeBytes: number;
  contentType: 'image/webp';
};

export class MenuImageOptimizationError extends Error {
  readonly code: 'EMPTY_FILE' | 'FILE_TOO_LARGE' | 'UNSUPPORTED_IMAGE' | 'INVALID_IMAGE';
  readonly status: 400 | 413 | 415;

  constructor(
    code: 'EMPTY_FILE' | 'FILE_TOO_LARGE' | 'UNSUPPORTED_IMAGE' | 'INVALID_IMAGE',
    status: 400 | 413 | 415,
    message: string,
  ) {
    super(message);
    this.name = 'MenuImageOptimizationError';
    this.code = code;
    this.status = status;
  }
}

export async function optimizeMenuImageToWebp(
  inputBuffer: Uint8Array,
  purpose: AssetUploadPurpose = 'item',
): Promise<OptimizedMenuImage> {
  if (inputBuffer.byteLength === 0) {
    throw new MenuImageOptimizationError(
      'EMPTY_FILE',
      400,
      'Select an image file before uploading.',
    );
  }

  if (inputBuffer.byteLength > MENU_IMAGE_MAX_UPLOAD_BYTES) {
    throw new MenuImageOptimizationError(
      'FILE_TOO_LARGE',
      413,
      'Image file exceeds the 4 MB upload limit.',
    );
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(inputBuffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new MenuImageOptimizationError(
      'INVALID_IMAGE',
      400,
      'Unable to read image file. Upload a valid JPG, PNG, WebP, or AVIF photo.',
    );
  }

  if (!metadata.format || !ALLOWED_INPUT_FORMATS.has(metadata.format)) {
    throw new MenuImageOptimizationError(
      'UNSUPPORTED_IMAGE',
      415,
      'Unsupported image format. Please upload a JPG, PNG, WebP, or AVIF photo.',
    );
  }

  const profile = OPTIMIZATION_PROFILES[purpose];

  try {
    const pipeline = sharp(inputBuffer, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().resize({
      width: profile.maxWidth,
      height: profile.maxHeight,
      fit: 'inside',
      withoutEnlargement: true,
    });

    const webpPipeline = profile.lossless
      ? pipeline.webp({ lossless: true, effort: 4 })
      : pipeline.webp({ quality: profile.quality, effort: 4 });

    const { data, info } = await webpPipeline.toBuffer({ resolveWithObject: true });

    if (data.byteLength === 0 || info.width <= 0 || info.height <= 0) {
      throw new Error('Empty output buffer');
    }

    return {
      buffer: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      width: info.width,
      height: info.height,
      sizeBytes: data.byteLength,
      contentType: 'image/webp',
    };
  } catch (error) {
    if (error instanceof MenuImageOptimizationError) throw error;
    throw new MenuImageOptimizationError(
      'INVALID_IMAGE',
      400,
      'Could not optimize the uploaded image. Try a different JPG, PNG, WebP, or AVIF file.',
    );
  }
}
