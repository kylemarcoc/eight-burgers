import { useAdminSessionQuery } from '@/features/admin-auth';
import { AdminCatalogManager } from '@/features/menu-catalog';
import { ShopSetupChecklist } from '@/features/store-settings';

export function AdminPage() {
  const sessionQuery = useAdminSessionQuery();
  const role = sessionQuery.data?.user?.role ?? 'owner';
  return (
    <div className="space-y-6">
      {role === 'owner' ? <ShopSetupChecklist /> : null}
      <AdminCatalogManager role={role} />
    </div>
  );
}
