import type { ProblemDetail } from '@menu-kiosk/contracts';

export type ApiFailure =
  | {
      kind: 'http';
      status: number;
      code: string;
      message: string;
      requestId?: string;
      fieldErrors?: Record<string, string[]>;
      retryAfterMs?: number;
      problem?: ProblemDetail;
    }
  | { kind: 'network'; message: string }
  | { kind: 'timeout'; message: string }
  | { kind: 'cancelled'; message: string }
  | { kind: 'validation'; message: string; issues: unknown };

export class ApiError extends Error {
  readonly failure: ApiFailure;

  constructor(failure: ApiFailure) {
    super(failure.message);
    this.name = 'ApiError';
    this.failure = failure;
  }

  get kind(): ApiFailure['kind'] {
    return this.failure.kind;
  }

  get status(): number | undefined {
    return this.failure.kind === 'http' ? this.failure.status : undefined;
  }

  get code(): string | undefined {
    return this.failure.kind === 'http' ? this.failure.code : undefined;
  }

  get retryAfterMs(): number | undefined {
    return this.failure.kind === 'http' ? this.failure.retryAfterMs : undefined;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (isApiError(error)) {
    return error.failure.message;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}
