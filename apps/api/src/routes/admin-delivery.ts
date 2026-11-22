import {
  deliveryPricingPatchSchema,
  deliveryZoneEnabledPatchSchema,
  deliveryZoneInputSchema,
} from '@eight-burgers/contracts';
import { Hono } from 'hono';
import { problemResponse, zodFieldErrors } from '../lib/problem';
import { createRequireAdminRolesMiddleware } from '../middleware/require-admin';
import type { ApiDeps, ApiEnv } from '../types';

export function createAdminDeliveryRoutes(deps: Pick<ApiDeps, 'gateway'>): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  const requireOwner = createRequireAdminRolesMiddleware(['owner']);

  app.patch('/delivery-pricing', requireOwner, async (c) => {
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

    const parsed = deliveryPricingPatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Invalid delivery threshold configuration.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const result = await deps.gateway.updateFreeDeliveryThreshold(
      accessToken,
      parsed.data.freeDeliveryMinSubtotalPhp,
      parsed.data.expectedVersion,
    );
    if (result.status === 'conflict') {
      return problemResponse(c, {
        status: 409,
        code: 'CONFLICT',
        title: 'Conflict',
        detail: 'Delivery pricing was updated on another device. Refresh and try again.',
      });
    }
    if (result.status === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'SETTINGS_NOT_FOUND',
        title: 'Not Found',
        detail: 'Store delivery settings were not found.',
      });
    }

    return c.json({ data: result.data }, 200);
  });

  app.post('/delivery-pricing/reset', requireOwner, async (c) => {
    const accessToken = c.get('adminAccessToken') ?? '';
    const updated = await deps.gateway.resetDeliveryPricing(accessToken);
    return c.json({ data: updated }, 200);
  });

  app.post('/delivery-zones', requireOwner, async (c) => {
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

    const parsed = deliveryZoneInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Delivery zone details are invalid.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const { expectedVersion: _ignored, ...input } = parsed.data;
    const created = await deps.gateway.createDeliveryZone(accessToken, input);
    return c.json({ data: created }, 201);
  });

  app.put('/delivery-zones/:id', requireOwner, async (c) => {
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

    const parsed = deliveryZoneInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Delivery zone details are invalid.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const { expectedVersion, ...input } = parsed.data;
    const result = await deps.gateway.updateDeliveryZone(accessToken, id, input, expectedVersion);
    if (result.status === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'DELIVERY_ZONE_NOT_FOUND',
        title: 'Not Found',
        detail: 'Delivery zone does not exist.',
      });
    }
    if (result.status === 'conflict') {
      return problemResponse(c, {
        status: 409,
        code: 'CONFLICT',
        title: 'Conflict',
        detail: 'This delivery zone was updated on another device. Refresh and try again.',
      });
    }

    return c.json({ data: result.data }, 200);
  });

  app.patch('/delivery-zones/:id/enabled', requireOwner, async (c) => {
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

    const parsed = deliveryZoneEnabledPatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Invalid enabled toggle payload.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const result = await deps.gateway.setDeliveryZoneEnabled(
      accessToken,
      id,
      parsed.data.enabled,
      parsed.data.expectedVersion,
    );
    if (result.status === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'DELIVERY_ZONE_NOT_FOUND',
        title: 'Not Found',
        detail: 'Delivery zone does not exist.',
      });
    }
    if (result.status === 'conflict') {
      return problemResponse(c, {
        status: 409,
        code: 'CONFLICT',
        title: 'Conflict',
        detail: 'This delivery zone was updated on another device. Refresh and try again.',
      });
    }

    return c.json({ data: result.data }, 200);
  });

  app.delete('/delivery-zones/:id', requireOwner, async (c) => {
    const accessToken = c.get('adminAccessToken') ?? '';
    const id = c.req.param('id');
    const result = await deps.gateway.deleteDeliveryZone(accessToken, id);
    if (result === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'DELIVERY_ZONE_NOT_FOUND',
        title: 'Not Found',
        detail: 'Delivery zone does not exist.',
      });
    }
    return c.body(null, 204);
  });

  return app;
}
