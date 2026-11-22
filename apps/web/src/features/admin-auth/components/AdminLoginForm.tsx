import { useId, useRef, useState, type FormEvent } from 'react';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { useAdminLoginMutation } from '../hooks/useAdminAuth';

export function AdminLoginForm() {
  const loginMutation = useAdminLoginMutation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFieldError('Enter a valid Owner Admin email address.');
      emailRef.current?.focus();
      return;
    }
    if (!password) {
      setFieldError('Enter your Owner Admin password.');
      passwordRef.current?.focus();
      return;
    }

    setFieldError(null);
    try {
      await loginMutation.mutateAsync({ email: trimmedEmail, password });
      setPassword('');
    } catch {
      // Error surfaced cleanly via loginMutation.error
    }
  }

  const serverError = loginMutation.error
    ? getApiErrorMessage(loginMutation.error, 'Sign-in failed. Check your credentials.')
    : null;
  const displayedError = fieldError ?? serverError;

  return (
    <section
      aria-labelledby="admin-login-heading"
      className="mx-auto my-8 max-w-md rounded-2xl border border-ui-border bg-ui-surface p-6"
    >
      <div className="space-y-1.5 border-b border-ui-border pb-4">
        <h1 id="admin-login-heading" className="text-2xl font-bold tracking-tight text-ui-text">
          Owner Admin Sign-In
        </h1>
        <p className="text-sm text-ui-text-muted">
          Sign in to manage Chino Roces menu items, delivery zones, and incoming orders.
        </p>
      </div>

      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="mt-5 space-y-4">
        <div>
          <label htmlFor={emailId} className="block text-xs font-semibold text-ui-text">
            Admin Email
          </label>
          <input
            ref={emailRef}
            id={emailId}
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="owner@eightburgers.local"
            aria-invalid={Boolean(displayedError)}
            aria-describedby={displayedError ? errorId : undefined}
            className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
          />
        </div>

        <div>
          <label htmlFor={passwordId} className="block text-xs font-semibold text-ui-text">
            Password
          </label>
          <input
            ref={passwordRef}
            id={passwordId}
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(displayedError)}
            aria-describedby={displayedError ? errorId : undefined}
            className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
          />
        </div>

        {displayedError ? (
          <p
            id={errorId}
            role="alert"
            className="rounded-xl border border-ui-error/40 bg-ui-surface-muted px-3 py-2 text-xs font-semibold text-ui-error"
          >
            {displayedError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="w-full rounded-xl bg-ui-accent px-4 py-2.5 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loginMutation.isPending ? 'Signing in…' : 'Sign in to Owner Admin'}
        </button>
      </form>
    </section>
  );
}
