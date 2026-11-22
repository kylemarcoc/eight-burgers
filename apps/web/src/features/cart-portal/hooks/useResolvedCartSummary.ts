import { calculateCartDetails, MENU_ADDONS, type CartSummary } from '@eight-burgers/contracts';
import { useMemo } from 'react';
import { useCatalogQuery } from '@/features/menu-catalog';
import { useCartLines } from '@/shared/store/useCartStore';

export function useResolvedCartSummary(): CartSummary {
  const cart = useCartLines();
  const catalogQuery = useCatalogQuery();
  const menu = catalogQuery.data?.menu;
  const addons = catalogQuery.data?.addons ?? MENU_ADDONS;

  return useMemo(() => {
    if (!menu) {
      const totalItems = cart.reduce((sum, line) => sum + line.quantity, 0);
      return { lines: [], unavailableLineIds: [], removedLineIds: [], totalItems, subtotalPhp: 0 };
    }
    return calculateCartDetails(cart, menu, addons);
  }, [cart, menu, addons]);
}
