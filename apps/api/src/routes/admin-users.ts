import { createAdminUserRequestSchema, updateAdminUserRequestSchema } from '@menu-kiosk/contracts';
import { Hono } from 'hono';
import { problemResponse, zodFieldErrors } from '../lib/problem';
import { createRequireAdminRolesMiddleware } from '../middleware/require-admin';
import type { ApiDeps, ApiEnv } from '../types';

export function createAdminUserRoutes(
  deps: Pick<ApiDeps, 'gateway' | 'adminAuthCache'>,
): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  const requireOwner = createRequireAdminRolesMiddleware(['owner']);

  app.get('/users', requireOwner, async (c) => {
    const accessToken = c.get('adminAccessToken') ?? '';
    const members = await deps.gateway.listAdminUsers(accessToken);
    return c.json({ data: members }, 200);
  });

  app.post('/users', requireOwner, async (c) => {
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

    const parsed = createAdminUserRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Please check the team account fields.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const result = await deps.gateway.createAdminUser(accessToken, parsed.data);
    if (result.status === 'email_exists') {
      return problemResponse(c, {
        status: 409,
        code: 'EMAIL_ALREADY_REGISTERED',
        title: 'Conflict',
        detail: 'An account with this email address is already registered.',
        fieldErrors: { email: ['This email address is already registered.'] },
      });
    }

    return c.json({ data: result.member }, 201);
  });

  app.patch('/users/:userId', requireOwner, async (c) => {
    const accessToken = c.get('adminAccessToken') ?? '';
    const adminUser = c.get('adminUser');
    const userId = c.req.param('userId');

    if (adminUser && adminUser.id === userId) {
      return problemResponse(c, {
        status: 400,
        code: 'CANNOT_MODIFY_SELF',
        title: 'Bad Request',
        detail: 'You cannot change your own role or disable your own Staff Portal account.',
      });
    }

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

    const parsed = updateAdminUserRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Invalid team account update payload.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const result = await deps.gateway.updateAdminUser(accessToken, userId, parsed.data);
    if (result.status === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'ADMIN_USER_NOT_FOUND',
        title: 'Not Found',
        detail: 'Team account could not be found.',
      });
    }
    if (result.status === 'last_owner') {
      return problemResponse(c, {
        status: 409,
        code: 'LAST_ACTIVE_OWNER',
        title: 'Conflict',
        detail: 'At least one active Owner account must remain enabled.',
      });
    }

    deps.adminAuthCache?.invalidateUser(userId);
    return c.json({ data: result.member }, 200);
  });

  return app;
}
