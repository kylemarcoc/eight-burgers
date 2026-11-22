import type { ProblemDetail } from '@eight-burgers/contracts';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';

export type ProblemInput = {
  status: ContentfulStatusCode;
  code: string;
  title: string;
  detail: string;
  fieldErrors?: Record<string, string[]>;
};

export function problemResponse(c: Context, input: ProblemInput): Response {
  const requestId = c.get('requestId') as string | undefined;
  const body: ProblemDetail = {
    type: `https://eight-burgers.local/problems/${input.code.toLowerCase()}`,
    title: input.title,
    status: input.status,
    code: input.code,
    detail: input.detail,
    ...(requestId ? { requestId } : {}),
    ...(input.fieldErrors && Object.keys(input.fieldErrors).length > 0
      ? { fieldErrors: input.fieldErrors }
      : {}),
  };

  return c.body(JSON.stringify(body), input.status, {
    'Content-Type': 'application/problem+json; charset=utf-8',
  });
}

export function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_root';
    const list = fieldErrors[key] ?? [];
    list.push(issue.message);
    fieldErrors[key] = list;
  }
  return fieldErrors;
}
