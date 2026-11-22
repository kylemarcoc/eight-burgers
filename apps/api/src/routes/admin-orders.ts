import {
  adminOrderRangeSchema,
  adminOrderSortSchema,
  adminOrderStatusFilterSchema,
  updateOrderStatusRequestSchema,
} from '@eight-burgers/contracts';
import { Hono } from 'hono';
import { problemResponse, zodFieldErrors } from '../lib/problem';
import type { AdminOrderCursor } from '../lib/supabase';
import type { ApiDeps, ApiEnv } from '../types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTEGER_REGEX = /^\d+$/;

function parseCompositeCursor(raw: string): AdminOrderCursor | null {
  const separatorIdx = raw.indexOf('|');
  if (separatorIdx <= 0 || separatorIdx === raw.length - 1) return null;
  const createdAtRaw = raw.slice(0, separatorIdx);
  const id = raw.slice(separatorIdx + 1);
  if (!UUID_REGEX.test(id)) return null;
  const parsedMs = Date.parse(createdAtRaw);
  if (Number.isNaN(parsedMs)) return null;
  return {
    createdAt: new Date(parsedMs).toISOString(),
    id,
  };
}

export function createAdminOrderRoutes(deps: Pick<ApiDeps, 'gateway'>): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();

  app.get('/orders', async (c) => {
    const accessToken = c.get('adminAccessToken') ?? '';
    const statusParam = c.req.query('status');
    const rangeParam = c.req.query('range');
    const sortParam = c.req.query('sort');
    const searchParam = c.req.query('q');
    const limitParam = c.req.query('limit');
    const cursorParam = c.req.query('cursor');

    let status: ReturnType<typeof adminOrderStatusFilterSchema.parse> | undefined;
    if (statusParam) {
      const parsed = adminOrderStatusFilterSchema.safeParse(statusParam);
      if (!parsed.success) {
        return problemResponse(c, {
          status: 400,
          code: 'INVALID_QUERY',
          title: 'Bad Request',
          detail: 'Unsupported order status filter.',
          fieldErrors: {
            status: ['Must be all, active, received, grilling, ready, or completed.'],
          },
        });
      }
      status = parsed.data;
    }

    let range: ReturnType<typeof adminOrderRangeSchema.parse> | undefined;
    if (rangeParam) {
      const parsed = adminOrderRangeSchema.safeParse(rangeParam);
      if (!parsed.success) {
        return problemResponse(c, {
          status: 400,
          code: 'INVALID_QUERY',
          title: 'Bad Request',
          detail: 'Unsupported order date range filter.',
          fieldErrors: { range: ['Must be today, 7d, or all.'] },
        });
      }
      range = parsed.data;
    }

    let sort: ReturnType<typeof adminOrderSortSchema.parse> | undefined;
    if (sortParam) {
      const parsed = adminOrderSortSchema.safeParse(sortParam);
      if (!parsed.success) {
        return problemResponse(c, {
          status: 400,
          code: 'INVALID_QUERY',
          title: 'Bad Request',
          detail: 'Unsupported order sort direction.',
          fieldErrors: { sort: ['Must be desc or asc.'] },
        });
      }
      sort = parsed.data;
    }

    const q = searchParam?.trim();
    if (q && q.length > 100) {
      return problemResponse(c, {
        status: 400,
        code: 'INVALID_QUERY',
        title: 'Bad Request',
        detail: 'Search query is too long.',
        fieldErrors: { q: ['Search query must be 100 characters or fewer.'] },
      });
    }

    let limit = 50;
    if (limitParam !== undefined) {
      if (!INTEGER_REGEX.test(limitParam)) {
        return problemResponse(c, {
          status: 400,
          code: 'INVALID_QUERY',
          title: 'Bad Request',
          detail: 'Invalid limit parameter.',
          fieldErrors: { limit: ['Limit must be an integer between 1 and 100.'] },
        });
      }
      const parsedLimit = Number(limitParam);
      if (parsedLimit < 1 || parsedLimit > 100) {
        return problemResponse(c, {
          status: 400,
          code: 'INVALID_QUERY',
          title: 'Bad Request',
          detail: 'Invalid limit parameter.',
          fieldErrors: { limit: ['Limit must be an integer between 1 and 100.'] },
        });
      }
      limit = parsedLimit;
    }

    let cursor: AdminOrderCursor | undefined;
    if (cursorParam) {
      const parsedCursor = parseCompositeCursor(cursorParam);
      if (!parsedCursor) {
        return problemResponse(c, {
          status: 400,
          code: 'INVALID_QUERY',
          title: 'Bad Request',
          detail: 'Invalid pagination cursor.',
          fieldErrors: { cursor: ['Cursor must be a valid keyset token.'] },
        });
      }
      cursor = parsedCursor;
    }

    const { orders, nextCursor, counts } = await deps.gateway.listAdminOrders(accessToken, {
      ...(status ? { status } : {}),
      ...(range ? { range } : {}),
      ...(sort ? { sort } : {}),
      ...(q ? { q } : {}),
      limit,
      ...(cursor ? { cursor } : {}),
    });

    return c.json({ data: orders, nextCursor, ...(counts ? { counts } : {}) }, 200);
  });

  app.patch('/orders/:id/status', async (c) => {
    const accessToken = c.get('adminAccessToken') ?? '';
    const orderId = c.req.param('id');
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

    const parsed = updateOrderStatusRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Invalid order status update payload.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const result = await deps.gateway.updateOrderStatus(
      accessToken,
      orderId,
      parsed.data.status,
      parsed.data.expectedVersion,
    );
    if (result.status === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'ORDER_NOT_FOUND',
        title: 'Not Found',
        detail: 'Order could not be found.',
      });
    }
    if (result.status === 'conflict') {
      return problemResponse(c, {
        status: 409,
        code: 'CONFLICT',
        title: 'Conflict',
        detail: 'This order status was updated on another device. Refresh and try again.',
      });
    }

    return c.json({ data: result.data }, 200);
  });

  return app;
}
