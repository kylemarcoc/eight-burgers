import {
  optionChoiceAvailabilityPatchSchema,
  optionGroupInputSchema,
  optionGroupPatchSchema,
  reorderIdsRequestSchema,
} from '@menu-kiosk/contracts';
import { Hono } from 'hono';
import { problemResponse, zodFieldErrors } from '../lib/problem';
import { createRequireAdminRolesMiddleware } from '../middleware/require-admin';
import type { ApiDeps, ApiEnv } from '../types';

export function createAdminOptionRoutes(deps: Pick<ApiDeps, 'gateway'>): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  const requireOwner = createRequireAdminRolesMiddleware(['owner']);
  const requireStaffPortal = createRequireAdminRolesMiddleware(['owner', 'cashier', 'staff']);

  app.get('/option-groups', requireStaffPortal, async (c) => {
    const accessToken = c.get('adminAccessToken') ?? '';
    const groups = await deps.gateway.listOptionGroups(accessToken);
    return c.json({ data: groups }, 200);
  });

  app.post('/option-groups', requireOwner, async (c) => {
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

    const parsed = optionGroupInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Option group details are invalid.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const { expectedVersion: _ignored, ...input } = parsed.data;
    const result = await deps.gateway.createOptionGroup(accessToken, input);
    if (result.status === 'conflict_slug') {
      return problemResponse(c, {
        status: 409,
        code: 'OPTION_GROUP_ALREADY_EXISTS',
        title: 'Conflict',
        detail: 'An option group or choice with that identifier already exists.',
        fieldErrors: { id: ['Choose a different option group or choice identifier.'] },
      });
    }

    return c.json({ data: result.data }, 201);
  });

  app.post('/option-groups/reorder', requireOwner, async (c) => {
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
        detail: 'Provide a valid ordered list of option group IDs.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const updated = await deps.gateway.reorderOptionGroups(accessToken, parsed.data.orderedIds);
    return c.json({ data: updated }, 200);
  });

  app.put('/option-groups/:id', requireOwner, async (c) => {
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

    const parsed = optionGroupInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Option group details are invalid.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const { expectedVersion, id: _ignoredId, ...patch } = parsed.data;
    const result = await deps.gateway.updateOptionGroup(accessToken, id, patch, expectedVersion);
    if (result.status === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'OPTION_GROUP_NOT_FOUND',
        title: 'Not Found',
        detail: 'Option group does not exist.',
      });
    }
    if (result.status === 'conflict') {
      return problemResponse(c, {
        status: 409,
        code: 'CONFLICT',
        title: 'Conflict',
        detail: 'This option group was updated on another device. Refresh and try again.',
      });
    }
    if (result.status === 'conflict_slug') {
      return problemResponse(c, {
        status: 409,
        code: 'OPTION_CHOICE_ALREADY_EXISTS',
        title: 'Conflict',
        detail: 'An option choice with that identifier already exists in another group.',
        fieldErrors: { choices: ['Option choice identifiers must be unique across groups.'] },
      });
    }
    if (result.status === 'validation_error') {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: result.message,
        fieldErrors: { [result.field]: [result.message] },
      });
    }

    return c.json({ data: result.data }, 200);
  });

  app.patch('/option-groups/:id', requireOwner, async (c) => {
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

    const parsed = optionGroupPatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Invalid option group update payload.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const { expectedVersion, ...patch } = parsed.data;
    const result = await deps.gateway.updateOptionGroup(accessToken, id, patch, expectedVersion);
    if (result.status === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'OPTION_GROUP_NOT_FOUND',
        title: 'Not Found',
        detail: 'Option group does not exist.',
      });
    }
    if (result.status === 'conflict') {
      return problemResponse(c, {
        status: 409,
        code: 'CONFLICT',
        title: 'Conflict',
        detail: 'This option group was updated on another device. Refresh and try again.',
      });
    }
    if (result.status === 'conflict_slug') {
      return problemResponse(c, {
        status: 409,
        code: 'OPTION_CHOICE_ALREADY_EXISTS',
        title: 'Conflict',
        detail: 'An option choice with that identifier already exists in another group.',
        fieldErrors: { choices: ['Option choice identifiers must be unique across groups.'] },
      });
    }
    if (result.status === 'validation_error') {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: result.message,
        fieldErrors: { [result.field]: [result.message] },
      });
    }

    return c.json({ data: result.data }, 200);
  });

  app.delete('/option-groups/:id', requireOwner, async (c) => {
    const accessToken = c.get('adminAccessToken') ?? '';
    const id = c.req.param('id');
    const result = await deps.gateway.deleteOptionGroup(accessToken, id);
    if (result === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'OPTION_GROUP_NOT_FOUND',
        title: 'Not Found',
        detail: 'Option group does not exist.',
      });
    }
    if (result === 'in_use') {
      return problemResponse(c, {
        status: 409,
        code: 'OPTION_GROUP_IN_USE',
        title: 'Option Group In Use',
        detail:
          'Remove this option group from all linked menu items before deleting it, or pause it instead.',
      });
    }
    return c.body(null, 204);
  });

  app.patch('/option-choices/:id/availability', requireStaffPortal, async (c) => {
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

    const parsed = optionChoiceAvailabilityPatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Invalid option choice availability payload.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const result = await deps.gateway.setOptionChoiceAvailability(
      accessToken,
      id,
      parsed.data.available,
      parsed.data.expectedVersion,
    );
    if (result.status === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'OPTION_CHOICE_NOT_FOUND',
        title: 'Not Found',
        detail: 'Option choice does not exist.',
      });
    }
    if (result.status === 'conflict') {
      return problemResponse(c, {
        status: 409,
        code: 'CONFLICT',
        title: 'Conflict',
        detail: 'This option choice was updated on another device. Refresh and try again.',
      });
    }

    return c.json({ data: result.data }, 200);
  });

  return app;
}
