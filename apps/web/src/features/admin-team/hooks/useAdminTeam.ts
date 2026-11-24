import type { CreateAdminUserRequest, UpdateAdminUserRequest } from '@menu-kiosk/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { handleAdminUnauthorizedError } from '@/shared/lib/admin-session-cache';
import { adminTeamKeys, createAdminUser, fetchAdminTeam, updateAdminUser } from '../api/team-api';

export function useAdminTeamQuery(enabled = true) {
  return useQuery({
    queryKey: adminTeamKeys.list(),
    queryFn: ({ signal }) => fetchAdminTeam(signal),
    staleTime: 30_000,
    enabled,
  });
}

export function useAdminTeamMutations() {
  const queryClient = useQueryClient();
  const onError = (error: unknown) => {
    handleAdminUnauthorizedError(queryClient, error);
  };

  const createMember = useMutation({
    mutationFn: (payload: CreateAdminUserRequest) => createAdminUser(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminTeamKeys.all });
    },
    onError,
  });

  const updateMember = useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: UpdateAdminUserRequest }) =>
      updateAdminUser(userId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminTeamKeys.all });
    },
    onError,
  });

  return {
    createMember,
    updateMember,
  };
}
