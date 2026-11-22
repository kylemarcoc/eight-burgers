import { NavLink, Outlet } from 'react-router-dom';
import {
  AdminAuthGuard,
  useAdminLogoutMutation,
  useAdminSessionQuery,
} from '@/features/admin-auth';

function AdminShell() {
  const sessionQuery = useAdminSessionQuery();
  const logoutMutation = useAdminLogoutMutation();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-ui-border bg-ui-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Admin sections" className="flex flex-wrap items-center gap-2">
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
            Menu & Delivery
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
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          {sessionQuery.data?.user ? (
            <span className="rounded-lg border border-ui-border bg-ui-surface-muted px-3 py-1.5 text-xs text-ui-text-muted">
              {sessionQuery.data.user.email}
            </span>
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
