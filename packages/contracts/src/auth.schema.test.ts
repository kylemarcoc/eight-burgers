import { describe, expect, it } from 'vitest';
import {
  ADMIN_ROLE_LABELS,
  ADMIN_ROLE_VALUES,
  adminRoleSchema,
  createAdminUserRequestSchema,
  getAdminPermissions,
  hasAdminRole,
  updateAdminUserRequestSchema,
} from './auth.schema';

describe('auth.schema RBAC helpers', () => {
  it('validates owner, cashier, and staff roles while rejecting unsupported roles', () => {
    expect(ADMIN_ROLE_VALUES).toEqual(['owner', 'cashier', 'staff']);
    for (const role of ADMIN_ROLE_VALUES) {
      expect(adminRoleSchema.parse(role)).toBe(role);
      expect(ADMIN_ROLE_LABELS[role]).toBeTruthy();
    }
    expect(adminRoleSchema.safeParse('manager').success).toBe(false);
    expect(adminRoleSchema.safeParse('').success).toBe(false);
  });

  it('grants full permissions to owner, payment+pause to cashier, and scoped stock+order to staff', () => {
    expect(getAdminPermissions('owner')).toEqual({
      canManageCatalog: true,
      canToggleMenuStock: true,
      canManageDelivery: true,
      canManageOrders: true,
      canManageTeam: true,
      canConfirmPayment: true,
      canPauseOrders: true,
    });

    expect(getAdminPermissions('cashier')).toEqual({
      canManageCatalog: false,
      canToggleMenuStock: true,
      canManageDelivery: false,
      canManageOrders: true,
      canManageTeam: false,
      canConfirmPayment: true,
      canPauseOrders: true,
    });

    expect(getAdminPermissions('staff')).toEqual({
      canManageCatalog: false,
      canToggleMenuStock: true,
      canManageDelivery: false,
      canManageOrders: true,
      canManageTeam: false,
      canConfirmPayment: false,
      canPauseOrders: false,
    });
  });

  it('checks role membership via hasAdminRole', () => {
    expect(hasAdminRole('owner', ['owner'])).toBe(true);
    expect(hasAdminRole('cashier', ['owner'])).toBe(false);
    expect(hasAdminRole('cashier', ['owner', 'cashier', 'staff'])).toBe(true);
    expect(hasAdminRole('staff', ['owner', 'cashier', 'staff'])).toBe(true);
  });

  it('validates createAdminUserRequestSchema and normalizes email casing', () => {
    const parsed = createAdminUserRequestSchema.parse({
      email: '  Cashier2@YourShop.Local  ',
      password: 'StrongPassword123!',
      role: 'cashier',
    });
    expect(parsed).toEqual({
      email: 'cashier2@yourshop.local',
      password: 'StrongPassword123!',
      role: 'cashier',
    });

    expect(
      createAdminUserRequestSchema.safeParse({
        email: 'not-an-email',
        password: 'StrongPassword123!',
        role: 'staff',
      }).success,
    ).toBe(false);

    expect(
      createAdminUserRequestSchema.safeParse({
        email: 'staff2@yourshop.local',
        password: 'short',
        role: 'staff',
      }).success,
    ).toBe(false);
  });

  it('requires at least role or active in updateAdminUserRequestSchema', () => {
    expect(updateAdminUserRequestSchema.safeParse({}).success).toBe(false);
    expect(updateAdminUserRequestSchema.parse({ role: 'staff' })).toEqual({ role: 'staff' });
    expect(updateAdminUserRequestSchema.parse({ active: false })).toEqual({ active: false });
    expect(updateAdminUserRequestSchema.parse({ role: 'cashier', active: true })).toEqual({
      role: 'cashier',
      active: true,
    });
  });
});
