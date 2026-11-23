import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StorefrontCatalog, useCatalogQuery } from '@/features/menu-catalog';
import { useCartActions } from '@/shared/store/useCartStore';

export function HomePage() {
  const [searchParams] = useSearchParams();
  const catalogQuery = useCatalogQuery();
  const { setDineInTable } = useCartActions();

  const fulfillmentParam = searchParams.get('fulfillment');
  const tableParam = searchParams.get('table');
  const dineInEnabled = catalogQuery.data?.store?.dineInEnabled ?? false;

  useEffect(() => {
    if (!catalogQuery.isSuccess || !dineInEnabled) return;
    if (fulfillmentParam !== 'dine-in') return;
    if (!tableParam || !tableParam.trim()) return;
    setDineInTable(tableParam);
  }, [catalogQuery.isSuccess, dineInEnabled, fulfillmentParam, tableParam, setDineInTable]);

  return <StorefrontCatalog />;
}
