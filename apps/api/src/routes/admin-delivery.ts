import { deliveryPricingPatchSchema } from '@eight-burgers/contracts';
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
        detail: 'Invalid delivery pricing configuration.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const { expectedVersion, ...rawPatch } = parsed.data;
    const patch = {
      ...rawPatch,
      ...(rawPatch.maxDistanceKm !== undefined
        ? { maxDistanceKm: Math.round(rawPatch.maxDistanceKm * 10) / 10 }
        : {}),
    };

    const result = await deps.gateway.updateDeliveryPricing(accessToken, patch, expectedVersion);
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

  return app;
}
