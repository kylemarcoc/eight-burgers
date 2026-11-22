import { z } from 'zod';

export const adminRoleSchema = z.enum(['owner', 'staff']);
export type AdminRole = z.infer<typeof adminRoleSchema>;

export const adminUserSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  role: adminRoleSchema,
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminLoginRequestSchema = z.strictObject({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.').max(200),
});
export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>;

export const adminSessionSchema = z.object({
  authenticated: z.boolean(),
  user: adminUserSchema.nullable(),
});
export type AdminSession = z.infer<typeof adminSessionSchema>;

export const adminSessionResponseSchema = z.object({
  data: adminSessionSchema,
});
