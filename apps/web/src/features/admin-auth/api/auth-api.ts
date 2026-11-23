import {
  adminSessionResponseSchema,
  type AdminLoginRequest,
  type AdminSession,
} from '@menu-kiosk/contracts';
import { apiRequest } from '@/shared/lib/http-client';

export const adminAuthKeys = {
  all: ['admin', 'auth'] as const,
  session: () => [...adminAuthKeys.all, 'session'] as const,
};

export async function fetchAdminSession(signal?: AbortSignal): Promise<AdminSession> {
  const res = await apiRequest('/auth/session', {
    signal,
    schema: adminSessionResponseSchema,
  });
  return res.data;
}

export async function loginAdmin(payload: AdminLoginRequest): Promise<AdminSession> {
  const res = await apiRequest('/auth/login', {
    method: 'POST',
    body: payload,
    schema: adminSessionResponseSchema,
  });
  return res.data;
}

export async function logoutAdmin(): Promise<void> {
  await apiRequest('/auth/logout', {
    method: 'POST',
  });
}
