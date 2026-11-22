import {
  MENU_IMAGE_MAX_UPLOAD_BYTES,
  deleteMenuImageRequestSchema,
  menuAvailabilityPatchSchema,
  menuItemInputSchema,
} from '@eight-burgers/contracts';
import { Hono } from 'hono';
import { MenuImageOptimizationError, optimizeMenuImageToWebp } from '../lib/image-optimizer';
import { problemResponse, zodFieldErrors } from '../lib/problem';
import { createRequireAdminRolesMiddleware } from '../middleware/require-admin';
import type { ApiDeps, ApiEnv } from '../types';

export function createAdminMenuRoutes(
  deps: Pick<ApiDeps, 'gateway' | 'optimizeMenuImage'>,
): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  const optimizeImage = deps.optimizeMenuImage ?? optimizeMenuImageToWebp;
  const requireOwner = createRequireAdminRolesMiddleware(['owner']);
  const requireStaffPortal = createRequireAdminRolesMiddleware(['owner', 'cashier', 'staff']);

  app.post('/menu-images', requireOwner, async (c) => {
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
        detail: 'Image file exceeds the 5 MB upload limit.',
        fieldErrors: { file: ['Image must be 5 MB or smaller.'] },
      });
    }

    const inputBuffer = new Uint8Array(await uploadedFile.arrayBuffer());
    let optimized;
    try {
      optimized = await optimizeImage(inputBuffer);
    } catch (error) {
      if (error instanceof MenuImageOptimizationError) {
        return problemResponse(c, {
          status: error.status,
          code: error.code,
          title: error.status === 413 ? 'Payload Too Large' : 'Bad Request',
          detail: error.message,
          fieldErrors: { file: [error.message] },
        });
      }
      throw error;
    }

    const stored = await deps.gateway.uploadMenuImage(accessToken, {
      buffer: optimized.buffer,
      contentType: optimized.contentType,
    });

    return c.json(
      {
        data: {
          imageUrl: stored.imageUrl,
          path: stored.path,
          sizeBytes: optimized.sizeBytes,
          width: optimized.width,
          height: optimized.height,
          contentType: optimized.contentType,
        },
      },
      201,
    );
  });

  app.delete('/menu-images', requireOwner, async (c) => {
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

    const parsed = deleteMenuImageRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Invalid menu image URL.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    await deps.gateway.deleteUnusedMenuImage(accessToken, parsed.data.imageUrl);
    return c.body(null, 204);
  });

  app.post('/menu-items', requireOwner, async (c) => {
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

    const parsed = menuItemInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Menu item details are invalid.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const { expectedVersion: _ignored, ...input } = parsed.data;
    const created = await deps.gateway.createMenuItem(accessToken, input);
    return c.json({ data: created }, 201);
  });

  app.put('/menu-items/:id', requireOwner, async (c) => {
    const accessToken = c.get('adminAccessToken') ?? '';
    const id = c.req.param('id');
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

    const parsed = menuItemInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Menu item details are invalid.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const { expectedVersion, ...input } = parsed.data;
    const result = await deps.gateway.updateMenuItem(accessToken, id, input, expectedVersion);
    if (result.status === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'MENU_ITEM_NOT_FOUND',
        title: 'Not Found',
        detail: 'Menu item does not exist.',
      });
    }
    if (result.status === 'conflict') {
      return problemResponse(c, {
        status: 409,
        code: 'CONFLICT',
        title: 'Conflict',
        detail: 'This menu item was updated on another device. Refresh and try again.',
      });
    }

    return c.json({ data: result.data }, 200);
  });

  app.patch('/menu-items/:id/availability', requireStaffPortal, async (c) => {
    const accessToken = c.get('adminAccessToken') ?? '';
    const id = c.req.param('id');
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

    const parsed = menuAvailabilityPatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Invalid availability payload.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const result = await deps.gateway.setMenuItemAvailability(
      accessToken,
      id,
      parsed.data.available,
      parsed.data.expectedVersion,
    );
    if (result.status === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'MENU_ITEM_NOT_FOUND',
        title: 'Not Found',
        detail: 'Menu item does not exist.',
      });
    }
    if (result.status === 'conflict') {
      return problemResponse(c, {
        status: 409,
        code: 'CONFLICT',
        title: 'Conflict',
        detail: 'This menu item was updated on another device. Refresh and try again.',
      });
    }

    return c.json({ data: result.data }, 200);
  });

  app.delete('/menu-items/:id', requireOwner, async (c) => {
    const accessToken = c.get('adminAccessToken') ?? '';
    const id = c.req.param('id');
    const result = await deps.gateway.deleteMenuItem(accessToken, id);
    if (result === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'MENU_ITEM_NOT_FOUND',
        title: 'Not Found',
        detail: 'Menu item does not exist.',
      });
    }
    return c.body(null, 204);
  });

  app.post('/menu-items/reset', requireOwner, async (c) => {
    const accessToken = c.get('adminAccessToken') ?? '';
    const items = await deps.gateway.resetMenuCatalog(accessToken);
    return c.json({ data: items }, 200);
  });

  return app;
}
