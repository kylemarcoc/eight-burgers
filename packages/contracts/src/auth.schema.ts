import { z } from 'zod';

export const ADMIN_ROLE_VALUES = ['owner', 'cashier', 'staff'] as const;
export const adminRoleSchema = z.enum(ADMIN_ROLE_VALUES);
export type AdminRole = z.infer<typeof adminRoleSchema>;

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  owner: 'Owner',
  cashier: 'Cashier',
  staff: 'Staff',
};

export type AdminPermissions = {
  canManageCatalog: boolean;
  canToggleMenuStock: boolean;
  canManageDelivery: boolean;
  canManageOrders: boolean;
  canManageTeam: boolean;
  canConfirmPayment: boolean;
  canPauseOrders: boolean;
};

export function getAdminPermissions(role: AdminRole): AdminPermissions {
  const isOwner = role === 'owner';
  const isOwnerOrCashier = role === 'owner' || role === 'cashier';
  return {
    canManageCatalog: isOwner,
    canToggleMenuStock: true,
    canManageDelivery: isOwner,
    canManageOrders: true,
    canManageTeam: isOwner,
    canConfirmPayment: isOwnerOrCashier,
    canPauseOrders: isOwnerOrCashier,
  };
}

export function hasAdminRole(role: AdminRole, allowed: readonly AdminRole[]): boolean {
  return allowed.includes(role);
}

export const adminUserSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  role: adminRoleSchema,
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminLoginRequestSchema = z.strictObject({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.').max(200),
});
export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>;

export const adminSessionSchema = z.object({
  authenticated: z.boolean(),
  user: adminUserSchema.nullable(),
});
export type AdminSession = z.infer<typeof adminSessionSchema>;

export const adminSessionResponseSchema = z.object({
  data: adminSessionSchema,
});

export const adminTeamMemberSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  role: adminRoleSchema,
  active: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type AdminTeamMember = z.infer<typeof adminTeamMemberSchema>;

export const adminTeamListResponseSchema = z.object({
  data: z.array(adminTeamMemberSchema),
});

export const adminTeamMemberResponseSchema = z.object({
  data: adminTeamMemberSchema,
});

export const createAdminUserRequestSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(200, 'Password must be 200 characters or fewer.'),
  role: adminRoleSchema,
});
export type CreateAdminUserRequest = z.infer<typeof createAdminUserRequestSchema>;

export const updateAdminUserRequestSchema = z
  .strictObject({
    role: adminRoleSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => data.role !== undefined || data.active !== undefined, {
    message: 'Provide a role or active status to update.',
  });
export type UpdateAdminUserRequest = z.infer<typeof updateAdminUserRequestSchema>;
