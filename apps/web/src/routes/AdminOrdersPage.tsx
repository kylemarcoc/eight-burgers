import { Suspense } from 'react';
import { useAdminSessionQuery } from '@/features/admin-auth';
import { AdminOrdersManager } from '@/features/orders';

export function AdminOrdersPage() {
  const sessionQuery = useAdminSessionQuery();
  const role = sessionQuery.data?.user?.role ?? 'staff';
  return (
    <Suspense
      fallback={
        <div
          role="status"
          className="rounded-2xl border border-ui-border bg-ui-surface p-6 text-sm text-ui-text-muted"
        >
          Loading customer orders…
        </div>
      }
    >
      <AdminOrdersManager role={role} />
    </Suspense>
  );
}
