import { useId, useRef, useState, type SubmitEvent } from 'react';
import { PasswordInput } from '@/shared/components/PasswordInput';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { useAdminLoginMutation } from '../hooks/useAdminAuth';

type LoginFieldError = {
  field: 'email' | 'password';
  message: string;
};

export function AdminLoginForm() {
  const loginMutation = useAdminLoginMutation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState<LoginFieldError | null>(null);

  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  function clearErrorsForField(field: 'email' | 'password') {
    if (fieldError?.field === field) {
      setFieldError(null);
    }
    if (loginMutation.error) {
      loginMutation.reset();
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loginMutation.isPending) {
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFieldError({
        field: 'email',
        message: 'Enter a valid Staff Portal email address.',
      });
      emailRef.current?.focus();
      return;
    }
    if (!password) {
      setFieldError({
        field: 'password',
        message: 'Enter your Staff Portal password.',
      });
      passwordRef.current?.focus();
      return;
    }

    setFieldError(null);
    try {
      await loginMutation.mutateAsync({ email: trimmedEmail, password });
      setPassword('');
      setShowPassword(false);
    } catch {
      // Error surfaced cleanly via loginMutation.error
    }
  }

  const serverError = loginMutation.error
    ? getApiErrorMessage(loginMutation.error, 'Sign-in failed. Check your credentials.')
    : null;
  const displayedError = fieldError?.message ?? serverError;
  const emailInvalid = fieldError ? fieldError.field === 'email' : Boolean(serverError);
  const passwordInvalid = fieldError ? fieldError.field === 'password' : Boolean(serverError);

  return (
    <section
      aria-labelledby="admin-login-heading"
      className="mx-auto my-8 max-w-md rounded-2xl border border-ui-border bg-ui-surface p-6"
    >
      <div className="space-y-1.5 border-b border-ui-border pb-4">
        <h1 id="admin-login-heading" className="text-2xl font-bold tracking-tight text-ui-text">
          Staff Portal Sign-In
        </h1>
        <p className="text-sm text-ui-text-muted">
          Sign in with an Owner, Cashier, or Staff account to manage customer orders and daily menu
          availability.
        </p>
      </div>

      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="mt-5 space-y-4">
        <div>
          <label htmlFor={emailId} className="block text-xs font-semibold text-ui-text">
            Staff Email
          </label>
          <input
            ref={emailRef}
            id={emailId}
            name="email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              clearErrorsForField('email');
            }}
            placeholder="owner@yourshop.com"
            aria-invalid={emailInvalid}
            aria-describedby={emailInvalid ? errorId : undefined}
            className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
          />
        </div>

        <div>
          <label htmlFor={passwordId} className="block text-xs font-semibold text-ui-text">
            Password
          </label>
          <PasswordInput
            ref={passwordRef}
            id={passwordId}
            name="password"
            autoComplete="current-password"
            value={password}
            visible={showPassword}
            onVisibleChange={setShowPassword}
            onChange={(event) => {
              setPassword(event.target.value);
              clearErrorsForField('password');
            }}
            aria-invalid={passwordInvalid}
            aria-describedby={passwordInvalid ? errorId : undefined}
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
          aria-busy={loginMutation.isPending || undefined}
          className="w-full rounded-xl bg-ui-accent px-4 py-2.5 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loginMutation.isPending ? 'Signing in…' : 'Sign in to Staff Portal'}
        </button>
      </form>
    </section>
  );
}
