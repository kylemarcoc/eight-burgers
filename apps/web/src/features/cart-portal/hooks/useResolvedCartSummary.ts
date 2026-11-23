import { calculateCartDetails, type CartSummary } from '@menu-kiosk/contracts';
import { useMemo } from 'react';
import { useCatalogQuery } from '@/features/menu-catalog';
import { useCartLines } from '@/shared/store/useCartStore';

export function useResolvedCartSummary(): CartSummary {
  const cart = useCartLines();
  const catalogQuery = useCatalogQuery();
  const menu = catalogQuery.data?.menu;
  const optionGroups = catalogQuery.data?.optionGroups;

  return useMemo(() => {
    if (!menu) {
      const totalItems = cart.reduce((sum, line) => sum + line.quantity, 0);
      return {
        lines: [],
        unavailableLineIds: [],
        invalidOptionLineIds: [],
        removedLineIds: [],
        totalItems,
        subtotalPhp: 0,
      };
    }
    return calculateCartDetails(cart, menu, optionGroups ?? []);
  }, [cart, menu, optionGroups]);
}
