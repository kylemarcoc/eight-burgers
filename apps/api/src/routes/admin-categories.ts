import {
  menuCategoryInputSchema,
  menuCategoryPatchSchema,
  reorderIdsRequestSchema,
} from '@menu-kiosk/contracts';
import { Hono } from 'hono';
import { problemResponse, zodFieldErrors } from '../lib/problem';
import { createRequireAdminRolesMiddleware } from '../middleware/require-admin';
import type { ApiDeps, ApiEnv } from '../types';

export function createAdminCategoryRoutes(deps: Pick<ApiDeps, 'gateway'>): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  const requireOwner = createRequireAdminRolesMiddleware(['owner']);
  const requireStaffPortal = createRequireAdminRolesMiddleware(['owner', 'cashier', 'staff']);

  app.get('/categories', requireStaffPortal, async (c) => {
    const accessToken = c.get('adminAccessToken') ?? '';
    const categories = await deps.gateway.listMenuCategories(accessToken);
    return c.json({ data: categories }, 200);
  });

  app.post('/categories', requireOwner, async (c) => {
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

    const parsed = menuCategoryInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Category details are invalid.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const { expectedVersion: _ignored, ...input } = parsed.data;
    const result = await deps.gateway.createMenuCategory(accessToken, input);
    if (result.status === 'conflict_slug') {
      return problemResponse(c, {
        status: 409,
        code: 'CATEGORY_ALREADY_EXISTS',
        title: 'Conflict',
        detail: 'A category with that identifier already exists.',
        fieldErrors: { id: ['Choose a different category name or identifier.'] },
      });
    }

    return c.json({ data: result.data }, 201);
  });

  app.post('/categories/reorder', requireOwner, async (c) => {
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

    const parsed = reorderIdsRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Provide a valid ordered list of category IDs.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const updated = await deps.gateway.reorderMenuCategories(accessToken, parsed.data.orderedIds);
    return c.json({ data: updated }, 200);
  });

  app.put('/categories/:id', requireOwner, async (c) => {
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

    const parsed = menuCategoryInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Category details are invalid.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const { expectedVersion, id: _ignoredId, ...patch } = parsed.data;
    const result = await deps.gateway.updateMenuCategory(accessToken, id, patch, expectedVersion);
    if (result.status === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'CATEGORY_NOT_FOUND',
        title: 'Not Found',
        detail: 'Category does not exist.',
      });
    }
    if (result.status === 'conflict') {
      return problemResponse(c, {
        status: 409,
        code: 'CONFLICT',
        title: 'Conflict',
        detail: 'This category was updated on another device. Refresh and try again.',
      });
    }

    return c.json({ data: result.data }, 200);
  });

  app.patch('/categories/:id', requireOwner, async (c) => {
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

    const parsed = menuCategoryPatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Invalid category update payload.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const { expectedVersion, ...patch } = parsed.data;
    const result = await deps.gateway.updateMenuCategory(accessToken, id, patch, expectedVersion);
    if (result.status === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'CATEGORY_NOT_FOUND',
        title: 'Not Found',
        detail: 'Category does not exist.',
      });
    }
    if (result.status === 'conflict') {
      return problemResponse(c, {
        status: 409,
        code: 'CONFLICT',
        title: 'Conflict',
        detail: 'This category was updated on another device. Refresh and try again.',
      });
    }

    return c.json({ data: result.data }, 200);
  });

  app.delete('/categories/:id', requireOwner, async (c) => {
    const accessToken = c.get('adminAccessToken') ?? '';
    const id = c.req.param('id');
    const result = await deps.gateway.deleteMenuCategory(accessToken, id);
    if (result === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'CATEGORY_NOT_FOUND',
        title: 'Not Found',
        detail: 'Category does not exist.',
      });
    }
    if (result === 'in_use') {
      return problemResponse(c, {
        status: 409,
        code: 'CATEGORY_IN_USE',
        title: 'Category In Use',
        detail: 'Reassign or delete all menu items in this category before deleting it.',
      });
    }
    return c.body(null, 204);
  });

  return app;
}
