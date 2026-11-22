import type { ReactNode } from 'react';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { useAdminSessionQuery } from '../hooks/useAdminAuth';
import { AdminLoginForm } from './AdminLoginForm';

export function AdminAuthGuard({ children }: { children: ReactNode }) {
  const sessionQuery = useAdminSessionQuery();

  if (sessionQuery.isPending) {
    return (
      <div
        role="status"
        className="flex min-h-[40vh] items-center justify-center text-sm text-ui-text-muted"
      >
        Checking Owner Admin session…
      </div>
    );
  }

  if (sessionQuery.isError) {
    return (
      <div
        role="alert"
        className="mx-auto my-8 max-w-md space-y-3 rounded-2xl border border-ui-error/40 bg-ui-surface p-6 text-center"
      >
        <p className="text-base font-semibold text-ui-text">Unable to verify admin session.</p>
        <p className="text-sm text-ui-text-muted">
          {getApiErrorMessage(sessionQuery.error, 'Check that the local API server is running.')}
        </p>
        <button
          type="button"
          onClick={() => void sessionQuery.refetch()}
          className="rounded-xl bg-ui-accent px-4 py-2 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!sessionQuery.data.authenticated || !sessionQuery.data.user) {
    return <AdminLoginForm />;
  }

  return <>{children}</>;
}
