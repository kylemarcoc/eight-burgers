import { lazy } from 'react';

export { orderKeys } from './api/orders-api';
export const AdminOrdersManager = lazy(() =>
  import('./components/AdminOrdersManager').then((module) => ({
    default: module.AdminOrdersManager,
  })),
);
export {
  useAdminOrdersQuery,
  useCancelOrderByQueueMutation,
  useCancelOrderByReceiptMutation,
  useInfiniteAdminOrdersQuery,
  useOrderReceiptQuery,
  usePlaceOrderMutation,
  usePublicOrderTrackerQuery,
  useSubmitPaymentReferenceMutation,
  useUpdateOrderPaymentStatusMutation,
  useUpdateOrderStatusMutation,
} from './hooks/useOrders';
export type { AdminOrdersQueryOptions } from './hooks/useOrders';
