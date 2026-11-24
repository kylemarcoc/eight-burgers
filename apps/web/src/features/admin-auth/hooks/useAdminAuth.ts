import type { AdminLoginRequest } from '@menu-kiosk/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clearAdminSessionCache } from '@/shared/lib/admin-session-cache';
import { adminAuthKeys, fetchAdminSession, loginAdmin, logoutAdmin } from '../api/auth-api';

export function useAdminSessionQuery() {
  return useQuery({
    queryKey: adminAuthKeys.session(),
    queryFn: ({ signal }) => fetchAdminSession(signal),
    staleTime: 60_000,
    retry: false,
  });
}

export function useAdminLoginMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AdminLoginRequest) => loginAdmin(payload),
    meta: {
      blockingBackdrop: true,
      loadingLabel: 'Signing in…',
    },
    onSuccess: (session) => {
      queryClient.setQueryData(adminAuthKeys.session(), session);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'team'] });
    },
  });
}

export function useAdminLogoutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => logoutAdmin(),
    meta: {
      blockingBackdrop: true,
      loadingLabel: 'Signing out…',
    },
    onSettled: async () => {
      await clearAdminSessionCache(queryClient);
    },
  });
}
