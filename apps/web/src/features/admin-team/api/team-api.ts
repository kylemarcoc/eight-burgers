import {
  adminTeamListResponseSchema,
  adminTeamMemberResponseSchema,
  type AdminTeamMember,
  type CreateAdminUserRequest,
  type UpdateAdminUserRequest,
} from '@menu-kiosk/contracts';
import { apiRequest } from '@/shared/lib/http-client';

export const adminTeamKeys = {
  all: ['admin', 'team'] as const,
  list: () => [...adminTeamKeys.all, 'list'] as const,
};

export async function fetchAdminTeam(signal?: AbortSignal): Promise<AdminTeamMember[]> {
  const res = await apiRequest('/admin/users', {
    signal,
    schema: adminTeamListResponseSchema,
  });
  return res.data;
}

export async function createAdminUser(payload: CreateAdminUserRequest): Promise<AdminTeamMember> {
  const res = await apiRequest('/admin/users', {
    method: 'POST',
    body: payload,
    schema: adminTeamMemberResponseSchema,
  });
  return res.data;
}

export async function updateAdminUser(
  userId: string,
  payload: UpdateAdminUserRequest,
): Promise<AdminTeamMember> {
  const res = await apiRequest(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: payload,
    schema: adminTeamMemberResponseSchema,
  });
  return res.data;
}
