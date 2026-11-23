import { useAdminSessionQuery } from '@/features/admin-auth';
import { AdminOrdersManager } from '@/features/orders';

export function AdminOrdersPage() {
  const sessionQuery = useAdminSessionQuery();
  const role = sessionQuery.data?.user?.role ?? 'staff';
  return <AdminOrdersManager role={role} />;
}
