import type { AdminLoginRequest } from '@menu-kiosk/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
    onSettled: async () => {
      await queryClient.cancelQueries({ queryKey: ['admin'] });
      queryClient.removeQueries({ queryKey: ['admin', 'orders'] });
      queryClient.removeQueries({ queryKey: ['admin', 'team'] });
      queryClient.setQueryData(adminAuthKeys.session(), {
        authenticated: false,
        user: null,
      });
    },
  });
}
