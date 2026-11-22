import { useAdminSessionQuery } from '@/features/admin-auth';
import { AdminCatalogManager } from '@/features/menu-catalog';

export function AdminPage() {
  const sessionQuery = useAdminSessionQuery();
  const role = sessionQuery.data?.user?.role ?? 'owner';
  return <AdminCatalogManager role={role} />;
}
