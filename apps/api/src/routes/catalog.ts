import { slugIdSchema, type SlugId } from '@menu-kiosk/contracts';
import { Hono } from 'hono';
import { problemResponse } from '../lib/problem';
import type { ApiDeps, ApiEnv } from '../types';

export function createCatalogRoutes(deps: Pick<ApiDeps, 'gateway'>): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();

  app.get('/catalog', async (c) => {
    const catalog = await deps.gateway.getCatalog();
    return c.json({ data: catalog }, 200);
  });

  app.get('/menu-items', async (c) => {
    const categoryParam = c.req.query('category');
    const availableParam = c.req.query('available');
    const qParam = c.req.query('q');

    let category: SlugId | undefined;
    if (categoryParam) {
      const parsed = slugIdSchema.safeParse(categoryParam);
      if (!parsed.success) {
        return problemResponse(c, {
          status: 400,
          code: 'INVALID_QUERY',
          title: 'Bad Request',
          detail: 'Unsupported menu category filter.',
          fieldErrors: { category: ['Must be a valid category slug.'] },
        });
      }
      category = parsed.data;
    }

    let available: boolean | undefined;
    if (availableParam === 'true') available = true;
    else if (availableParam === 'false') available = false;
    else if (availableParam !== undefined) {
      return problemResponse(c, {
        status: 400,
        code: 'INVALID_QUERY',
        title: 'Bad Request',
        detail: 'Query parameter available must be true or false.',
        fieldErrors: { available: ['Expected "true" or "false".'] },
      });
    }

    const items = await deps.gateway.listMenuItems({
      ...(category ? { category } : {}),
      ...(available !== undefined ? { available } : {}),
      ...(qParam ? { q: qParam } : {}),
    });

    return c.json({ data: items }, 200);
  });

  app.get('/delivery-pricing', async (c) => {
    const pricing = await deps.gateway.getDeliveryPricing();
    return c.json({ data: pricing }, 200);
  });

  return app;
}
