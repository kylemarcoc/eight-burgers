import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { KioskShell } from '@/app/components/KioskShell';
import { HomePage } from '@/routes/HomePage';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';

const AdminPage = lazy(() =>
  import('@/routes/AdminPage').then((module) => ({ default: module.AdminPage })),
);
const NotFoundPage = lazy(() =>
  import('@/routes/NotFoundPage').then((module) => ({ default: module.NotFoundPage })),
);

function RouteErrorFallback() {
  return (
    <div
      role="alert"
      className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-3 text-center"
    >
      <p className="text-base font-semibold text-ui-text">
        Unable to load this page after an update.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-xl bg-ui-accent px-4 py-2 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover"
      >
        Reload page
      </button>
    </div>
  );
}

function RouteFallback() {
  return (
    <div
      role="status"
      className="flex min-h-[50vh] items-center justify-center text-sm text-ui-text-muted"
    >
      Loading view…
    </div>
  );
}

function AppRouter() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ErrorBoundary fallback={<RouteErrorFallback />}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route element={<KioskShell />}>
              <Route index element={<HomePage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default AppRouter;
