import {
  MENU_IMAGE_MAX_UPLOAD_BYTES,
  deleteStoreAssetRequestSchema,
  storeAssetUploadPurposeSchema,
  storeOrderingStatusPatchSchema,
  storeProfilePatchSchema,
} from '@menu-kiosk/contracts';
import { Hono } from 'hono';
import { MenuImageOptimizationError, optimizeMenuImageToWebp } from '../lib/image-optimizer';
import { problemResponse, zodFieldErrors } from '../lib/problem';
import { createRequireAdminRolesMiddleware } from '../middleware/require-admin';
import type { ApiDeps, ApiEnv } from '../types';

export function createAdminStoreRoutes(
  deps: Pick<ApiDeps, 'gateway' | 'optimizeMenuImage' | 'storeProfileCache'>,
): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  const optimizeImage = deps.optimizeMenuImage ?? optimizeMenuImageToWebp;
  const requireOwner = createRequireAdminRolesMiddleware(['owner']);
  const requireOrderAvailabilityManager = createRequireAdminRolesMiddleware(['owner', 'cashier']);

  app.patch('/store-profile', requireOwner, async (c) => {
    const accessToken = c.get('adminAccessToken') ?? '';
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return problemResponse(c, {
        status: 400,
        code: 'INVALID_JSON',
        title: 'Bad Request',
        detail: 'Request body must be valid JSON.',
      });
    }

    const parsed = storeProfilePatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Invalid store profile details.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const { expectedVersion, ...patch } = parsed.data;
    const result = await deps.gateway.updateStoreProfile(accessToken, patch, expectedVersion);

    if (result.status === 'conflict') {
      return problemResponse(c, {
        status: 409,
        code: 'CONFLICT',
        title: 'Conflict',
        detail: 'Store settings were updated on another device. Refresh and try again.',
      });
    }
    if (result.status === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'SETTINGS_NOT_FOUND',
        title: 'Not Found',
        detail: 'Store settings were not found.',
      });
    }
    if (result.status === 'origin_required_for_delivery') {
      return problemResponse(c, {
        status: 422,
        code: 'DELIVERY_ORIGIN_REQUIRED',
        title: 'Store Location Required',
        detail: 'Disable delivery before clearing the store location pin.',
        fieldErrors: {
          originCoords: ['Disable delivery in Delivery Pricing before removing the store pin.'],
        },
      });
    }
    if (result.status === 'fulfillment_required') {
      return problemResponse(c, {
        status: 422,
        code: 'FULFILLMENT_REQUIRED',
        title: 'Fulfillment Required',
        detail: 'At least one fulfillment mode (Pickup, Delivery, or Dine-in) must remain enabled.',
        fieldErrors: {
          pickupEnabled: ['At least one fulfillment mode must remain enabled.'],
        },
      });
    }

    deps.storeProfileCache?.invalidate();
    return c.json({ data: result.data }, 200);
  });

  app.patch('/store-ordering-status', requireOrderAvailabilityManager, async (c) => {
    const accessToken = c.get('adminAccessToken') ?? '';
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return problemResponse(c, {
        status: 400,
        code: 'INVALID_JSON',
        title: 'Bad Request',
        detail: 'Request body must be valid JSON.',
      });
    }

    const parsed = storeOrderingStatusPatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Invalid store ordering status payload.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const { expectedVersion, ...patch } = parsed.data;
    const result = await deps.gateway.updateStoreOrderingStatus(
      accessToken,
      patch,
      expectedVersion,
    );

    if (result.status === 'conflict') {
      return problemResponse(c, {
        status: 409,
        code: 'CONFLICT',
        title: 'Conflict',
        detail: 'Store ordering status was updated on another device. Refresh and try again.',
      });
    }
    if (result.status === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'SETTINGS_NOT_FOUND',
        title: 'Not Found',
        detail: 'Store settings were not found.',
      });
    }

    deps.storeProfileCache?.invalidate();
    return c.json({ data: result.data }, 200);
  });

  app.post('/store-assets', requireOwner, async (c) => {
    const accessToken = c.get('adminAccessToken') ?? '';
    let formBody: Record<string, string | File | (string | File)[]>;
    try {
      formBody = await c.req.parseBody();
    } catch {
      return problemResponse(c, {
        status: 400,
        code: 'INVALID_MULTIPART',
        title: 'Bad Request',
        detail: 'Request body must be valid multipart/form-data.',
      });
    }

    const rawPurpose = Array.isArray(formBody.purpose) ? formBody.purpose[0] : formBody.purpose;
    const parsedPurpose = storeAssetUploadPurposeSchema.safeParse(
      typeof rawPurpose === 'string' ? rawPurpose.trim() : rawPurpose,
    );
    if (!parsedPurpose.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Specify a valid store asset purpose ("logo", "hero", or "payment-qr").',
        fieldErrors: {
          purpose: ['Purpose must be "logo", "hero", or "payment-qr".'],
        },
      });
    }

    const rawFile = formBody.file;
    const uploadedFile = Array.isArray(rawFile) ? rawFile[0] : rawFile;
    if (!(uploadedFile instanceof File)) {
      return problemResponse(c, {
        status: 400,
        code: 'IMAGE_FILE_REQUIRED',
        title: 'Bad Request',
        detail: 'Attach an image file under the "file" field.',
        fieldErrors: { file: ['Select a JPG, PNG, WebP, or AVIF image to upload.'] },
      });
    }

    if (uploadedFile.size === 0) {
      return problemResponse(c, {
        status: 400,
        code: 'EMPTY_FILE',
        title: 'Bad Request',
        detail: 'Select an image file before uploading.',
        fieldErrors: { file: ['Uploaded image file is empty.'] },
      });
    }

    if (uploadedFile.size > MENU_IMAGE_MAX_UPLOAD_BYTES) {
      return problemResponse(c, {
        status: 413,
        code: 'FILE_TOO_LARGE',
        title: 'Payload Too Large',
        detail: 'Image file exceeds the 4 MB upload limit.',
        fieldErrors: { file: ['Image must be 4 MB or smaller.'] },
      });
    }

    const inputBuffer = new Uint8Array(await uploadedFile.arrayBuffer());
    let optimized;
    try {
      optimized = await optimizeImage(inputBuffer, parsedPurpose.data);
    } catch (error) {
      if (error instanceof MenuImageOptimizationError) {
        return problemResponse(c, {
          status: error.status,
          code: error.code,
          title:
            error.status === 413
              ? 'Payload Too Large'
              : error.status === 415
                ? 'Unsupported Media Type'
                : 'Bad Request',
          detail: error.message,
          fieldErrors: { file: [error.message] },
        });
      }
      throw error;
    }

    const stored = await deps.gateway.uploadStoreAsset(accessToken, {
      buffer: optimized.buffer,
      contentType: optimized.contentType,
      purpose: parsedPurpose.data,
    });

    return c.json(
      {
        data: {
          imageUrl: stored.imageUrl,
          path: stored.path,
          purpose: parsedPurpose.data,
          sizeBytes: optimized.sizeBytes,
          width: optimized.width,
          height: optimized.height,
          contentType: optimized.contentType,
        },
      },
      201,
    );
  });

  app.delete('/store-assets', requireOwner, async (c) => {
    const accessToken = c.get('adminAccessToken') ?? '';
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return problemResponse(c, {
        status: 400,
        code: 'INVALID_JSON',
        title: 'Bad Request',
        detail: 'Request body must be valid JSON.',
      });
    }

    const parsed = deleteStoreAssetRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Invalid store asset URL.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    await deps.gateway.deleteUnusedStoreAsset(accessToken, parsed.data.imageUrl);
    return c.body(null, 204);
  });

  return app;
}
