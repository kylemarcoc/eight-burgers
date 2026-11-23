import { ADMIN_ROLE_LABELS, getAdminPermissions } from '@menu-kiosk/contracts';
import { NavLink, Outlet } from 'react-router-dom';
import {
  AdminAuthGuard,
  useAdminLogoutMutation,
  useAdminSessionQuery,
} from '@/features/admin-auth';

function AdminShell() {
  const sessionQuery = useAdminSessionQuery();
  const logoutMutation = useAdminLogoutMutation();
  const activeUser = sessionQuery.data?.user ?? null;
  const permissions = activeUser ? getAdminPermissions(activeUser.role) : null;
  const catalogTabLabel = permissions?.canManageCatalog ? 'Menu & Delivery' : 'Menu Stock';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-ui-border bg-ui-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Staff Portal sections" className="flex flex-wrap items-center gap-2">
          <NavLink
            to="/admin"
            end
            className={({ isActive }) =>
              `rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors motion-reduce:transition-none ${
                isActive
                  ? 'bg-ui-accent text-ui-on-accent'
                  : 'text-ui-text hover:bg-ui-surface-muted'
              }`
            }
          >
            {catalogTabLabel}
          </NavLink>
          <NavLink
            to="/admin/orders"
            className={({ isActive }) =>
              `rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors motion-reduce:transition-none ${
                isActive
                  ? 'bg-ui-accent text-ui-on-accent'
                  : 'text-ui-text hover:bg-ui-surface-muted'
              }`
            }
          >
            Customer Orders
          </NavLink>
          {permissions?.canManageCatalog ? (
            <NavLink
              to="/admin/settings"
              className={({ isActive }) =>
                `rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors motion-reduce:transition-none ${
                  isActive
                    ? 'bg-ui-accent text-ui-on-accent'
                    : 'text-ui-text hover:bg-ui-surface-muted'
                }`
              }
            >
              Store Settings
            </NavLink>
          ) : null}
          {permissions?.canManageTeam ? (
            <NavLink
              to="/admin/team"
              className={({ isActive }) =>
                `rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors motion-reduce:transition-none ${
                  isActive
                    ? 'bg-ui-accent text-ui-on-accent'
                    : 'text-ui-text hover:bg-ui-surface-muted'
                }`
              }
            >
              Team & Roles
            </NavLink>
          ) : null}
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          {activeUser ? (
            <div className="flex items-center gap-2 rounded-lg border border-ui-border bg-ui-surface-muted px-3 py-1.5 text-xs">
              <span className="rounded-md bg-ui-accent/15 px-2 py-0.5 font-semibold text-ui-accent">
                {ADMIN_ROLE_LABELS[activeUser.role]}
              </span>
              <span className="text-ui-text-muted">{activeUser.email}</span>
            </div>
          ) : null}

          <button
            type="button"
            disabled={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
            className="shrink-0 rounded-xl border border-ui-border bg-ui-surface px-3.5 py-1.5 text-sm font-medium text-ui-text hover:bg-ui-surface-muted disabled:opacity-60"
          >
            Sign out
          </button>
        </div>
      </div>

      <Outlet />
    </div>
  );
}

export function AdminLayout() {
  return (
    <AdminAuthGuard>
      <AdminShell />
    </AdminAuthGuard>
  );
}
