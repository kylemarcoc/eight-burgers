import { getAdminPermissions } from '@menu-kiosk/contracts';
import { Link } from 'react-router-dom';
import { useAdminSessionQuery } from '@/features/admin-auth';
import { AdminTeamManager } from '@/features/admin-team';

export function AdminTeamPage() {
  const sessionQuery = useAdminSessionQuery();
  const activeUser = sessionQuery.data?.user ?? null;
  const canManageTeam = activeUser ? getAdminPermissions(activeUser.role).canManageTeam : false;

  if (!activeUser || !canManageTeam) {
    return (
      <section
        aria-labelledby="owner-only-team-heading"
        className="mx-auto max-w-lg rounded-2xl border border-ui-border bg-ui-surface p-6 text-center"
      >
        <h1 id="owner-only-team-heading" className="text-xl font-bold text-ui-text">
          Owner access required
        </h1>
        <p className="mt-2 text-sm text-ui-text-muted">
          Only an Owner account can register team members or change Staff Portal roles.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link
            to="/admin"
            className="rounded-xl bg-ui-accent px-4 py-2 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover"
          >
            Go to Menu Stock
          </Link>
          <Link
            to="/admin/orders"
            className="rounded-xl border border-ui-border bg-ui-surface px-4 py-2 text-sm font-semibold text-ui-text hover:bg-ui-surface-muted"
          >
            View Customer Orders
          </Link>
        </div>
      </section>
    );
  }

  return <AdminTeamManager currentUserId={activeUser.id} />;
}
