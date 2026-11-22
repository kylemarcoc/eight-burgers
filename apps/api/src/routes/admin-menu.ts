import { menuAvailabilityPatchSchema, menuItemInputSchema } from '@eight-burgers/contracts';
import { Hono } from 'hono';
import { problemResponse, zodFieldErrors } from '../lib/problem';
import type { ApiDeps, ApiEnv } from '../types';

export function createAdminMenuRoutes(deps: Pick<ApiDeps, 'gateway'>): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();

  app.post('/menu-items', async (c) => {
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

  app.put('/menu-items/:id', async (c) => {
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

  app.patch('/menu-items/:id/availability', async (c) => {
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

  app.delete('/menu-items/:id', async (c) => {
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

  app.post('/menu-items/reset', async (c) => {
    const accessToken = c.get('adminAccessToken') ?? '';
    const items = await deps.gateway.resetMenuCatalog(accessToken);
    return c.json({ data: items }, 200);
  });

  return app;
}
