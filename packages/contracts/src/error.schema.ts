import { z } from 'zod';

export const problemDetailSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  status: z.number().int().min(400).max(599),
  code: z.string().min(1),
  detail: z.string().min(1),
  requestId: z.string().optional(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});
export type ProblemDetail = z.infer<typeof problemDetailSchema>;
