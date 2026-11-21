import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section
      aria-labelledby="not-found-heading"
      className="mx-auto flex min-h-[50vh] max-w-3xl flex-col justify-center gap-4 px-6 py-12"
    >
      <h1 id="not-found-heading" className="text-2xl font-semibold text-ui-text">
        Page not found
      </h1>
      <p className="text-ui-text-muted">The requested route does not exist.</p>
      <div>
        <Link to="/" className="font-medium text-ui-accent underline">
          Return home
        </Link>
      </div>
    </section>
  );
}
