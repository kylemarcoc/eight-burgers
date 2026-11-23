import {
  ADMIN_ROLE_LABELS,
  ADMIN_ROLE_VALUES,
  type AdminRole,
  type AdminTeamMember,
} from '@eight-burgers/contracts';
import { useId, useMemo, useRef, useState, type SubmitEvent } from 'react';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { useAdminTeamMutations, useAdminTeamQuery } from '../hooks/useAdminTeam';

type StatusBanner = {
  tone: 'success' | 'error';
  message: string;
};

type FormFieldErrors = {
  email?: string;
  password?: string;
};

const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  cashier:
    'Can manage Customer Orders and mark menu items In Stock / Sold Out. Cannot change prices, delivery fees, or team accounts.',
  staff:
    'Can update Customer Orders (Received, Grilling, Ready, Completed, Cancelled) and toggle Menu Stock. Cannot edit catalog prices or delivery settings.',
  owner:
    'Full access to Menu prices and photos, Delivery pricing and pause controls, Customer Orders, and Team & Roles.',
};

const ROLE_SORT_ORDER: Record<AdminRole, number> = {
  owner: 0,
  cashier: 1,
  staff: 2,
};

export type AdminTeamManagerProps = {
  currentUserId: string;
};

export function AdminTeamManager({ currentUserId }: AdminTeamManagerProps) {
  const teamQuery = useAdminTeamQuery(true);
  const { createMember, updateMember } = useAdminTeamMutations();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<AdminRole>('cashier');
  const [formErrors, setFormErrors] = useState<FormFieldErrors>({});
  const [statusBanner, setStatusBanner] = useState<StatusBanner | null>(null);
  const [pendingUserIds, setPendingUserIds] = useState<ReadonlySet<string>>(() => new Set());

  const emailId = useId();
  const emailErrorId = useId();
  const passwordId = useId();
  const passwordErrorId = useId();
  const roleId = useId();
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  const members = useMemo(() => {
    const list = teamQuery.data ?? [];
    return [...list].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      const roleDiff = ROLE_SORT_ORDER[a.role] - ROLE_SORT_ORDER[b.role];
      if (roleDiff !== 0) return roleDiff;
      return a.email.localeCompare(b.email);
    });
  }, [teamQuery.data]);

  const activeCount = useMemo(() => members.filter((member) => member.active).length, [members]);

  function setUserPending(userId: string, pending: boolean) {
    setPendingUserIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  async function handleCreateSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    const nextErrors: FormFieldErrors = {};

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextErrors.email = 'Enter a valid team email address.';
    }
    if (password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters.';
    }

    if (nextErrors.email || nextErrors.password) {
      setFormErrors(nextErrors);
      if (nextErrors.email) {
        emailRef.current?.focus();
      } else {
        passwordRef.current?.focus();
      }
      return;
    }

    setFormErrors({});
    setStatusBanner(null);

    try {
      const created = await createMember.mutateAsync({
        email: trimmedEmail,
        password,
        role,
      });
      setEmail('');
      setPassword('');
      setShowPassword(false);
      setRole('cashier');
      setStatusBanner({
        tone: 'success',
        message: `Created ${ADMIN_ROLE_LABELS[created.role]} account for ${created.email}.`,
      });
    } catch (error) {
      setStatusBanner({
        tone: 'error',
        message: getApiErrorMessage(error, 'Unable to create team account.'),
      });
    }
  }

  async function handleRoleChange(member: AdminTeamMember, nextRole: AdminRole) {
    if (nextRole === member.role || member.id === currentUserId) return;
    setUserPending(member.id, true);
    setStatusBanner(null);
    try {
      const updated = await updateMember.mutateAsync({
        userId: member.id,
        payload: { role: nextRole },
      });
      setStatusBanner({
        tone: 'success',
        message: `Updated ${updated.email} to ${ADMIN_ROLE_LABELS[updated.role]}.`,
      });
    } catch (error) {
      setStatusBanner({
        tone: 'error',
        message: getApiErrorMessage(error, 'Unable to update team member role.'),
      });
    } finally {
      setUserPending(member.id, false);
    }
  }

  async function handleToggleActive(member: AdminTeamMember) {
    if (member.id === currentUserId) return;
    const nextActive = !member.active;
    setUserPending(member.id, true);
    setStatusBanner(null);
    try {
      const updated = await updateMember.mutateAsync({
        userId: member.id,
        payload: { active: nextActive },
      });
      setStatusBanner({
        tone: 'success',
        message: updated.active
          ? `Re-enabled Staff Portal access for ${updated.email}.`
          : `Disabled Staff Portal access for ${updated.email}.`,
      });
    } catch (error) {
      setStatusBanner({
        tone: 'error',
        message: getApiErrorMessage(error, 'Unable to update account status.'),
      });
    } finally {
      setUserPending(member.id, false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-ui-border bg-ui-surface p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-ui-text">Team & Roles</h1>
            <p className="text-sm text-ui-text-muted">
              Register Cashier and Staff accounts, adjust role permissions, or disable logins for
              the Chino Roces Staff Portal.
            </p>
          </div>
          {teamQuery.isSuccess ? (
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-ui-text-muted">
              <span className="rounded-lg border border-ui-border bg-ui-surface-muted px-3 py-1.5 text-ui-text">
                {activeCount} active
              </span>
              <span className="rounded-lg border border-ui-border bg-ui-surface-muted px-3 py-1.5">
                {members.length} total accounts
              </span>
            </div>
          ) : null}
        </div>
      </section>

      {statusBanner ? (
        <div
          role={statusBanner.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            statusBanner.tone === 'error'
              ? 'border-ui-error/40 bg-ui-surface-muted text-ui-error'
              : 'border-ui-accent/40 bg-ui-surface text-ui-text'
          }`}
        >
          {statusBanner.message}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-12">
        <section
          aria-labelledby="register-team-heading"
          className="rounded-2xl border border-ui-border bg-ui-surface p-5 lg:col-span-5"
        >
          <div className="space-y-1 border-b border-ui-border pb-3">
            <h2 id="register-team-heading" className="text-lg font-bold text-ui-text">
              Register Team Member
            </h2>
            <p className="text-xs text-ui-text-muted">
              New accounts are ready to sign in at the Staff Portal immediately.
            </p>
          </div>

          <form
            noValidate
            onSubmit={(event) => void handleCreateSubmit(event)}
            className="mt-4 space-y-4"
          >
            <div>
              <label htmlFor={emailId} className="block text-xs font-semibold text-ui-text">
                Staff Email
              </label>
              <input
                ref={emailRef}
                id={emailId}
                name="email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (formErrors.email) {
                    setFormErrors((prev) => ({ ...prev, email: undefined }));
                  }
                }}
                placeholder="cashier2@eightburgers.local"
                aria-invalid={Boolean(formErrors.email)}
                aria-describedby={formErrors.email ? emailErrorId : undefined}
                className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
              />
              {formErrors.email ? (
                <p id={emailErrorId} role="alert" className="mt-1 text-xs text-ui-error">
                  {formErrors.email}
                </p>
              ) : null}
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={passwordId} className="block text-xs font-semibold text-ui-text">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="text-xs font-medium text-ui-accent hover:underline"
                >
                  {showPassword ? 'Hide password' : 'Show password'}
                </button>
              </div>
              <input
                ref={passwordRef}
                id={passwordId}
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (formErrors.password) {
                    setFormErrors((prev) => ({ ...prev, password: undefined }));
                  }
                }}
                placeholder="Minimum 8 characters"
                aria-invalid={Boolean(formErrors.password)}
                aria-describedby={formErrors.password ? passwordErrorId : undefined}
                className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
              />
              {formErrors.password ? (
                <p id={passwordErrorId} role="alert" className="mt-1 text-xs text-ui-error">
                  {formErrors.password}
                </p>
              ) : (
                <p className="mt-1 text-xs text-ui-text-muted">
                  Use at least 8 characters and share directly with the team member.
                </p>
              )}
            </div>

            <div>
              <label htmlFor={roleId} className="block text-xs font-semibold text-ui-text">
                Access Role
              </label>
              <select
                id={roleId}
                name="role"
                value={role}
                onChange={(event) => setRole(event.target.value as AdminRole)}
                className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
              >
                {ADMIN_ROLE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {ADMIN_ROLE_LABELS[value]}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 rounded-xl border border-ui-border bg-ui-surface-muted px-3 py-2 text-xs text-ui-text-muted">
                {ROLE_DESCRIPTIONS[role]}
              </p>
            </div>

            <button
              type="submit"
              disabled={createMember.isPending}
              className="w-full rounded-xl bg-ui-accent px-4 py-2.5 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createMember.isPending ? 'Creating account…' : 'Create Team Account'}
            </button>
          </form>
        </section>

        <section
          aria-labelledby="team-accounts-heading"
          className="rounded-2xl border border-ui-border bg-ui-surface p-5 lg:col-span-7"
        >
          <div className="space-y-1 border-b border-ui-border pb-3">
            <h2 id="team-accounts-heading" className="text-lg font-bold text-ui-text">
              Staff Portal Accounts
            </h2>
            <p className="text-xs text-ui-text-muted">
              Role changes and disabled accounts take effect immediately on the next request.
            </p>
          </div>

          {teamQuery.isPending ? (
            <div role="status" className="py-10 text-center text-sm text-ui-text-muted">
              Loading team accounts…
            </div>
          ) : teamQuery.isError ? (
            <div
              role="alert"
              className="mt-4 space-y-3 rounded-xl border border-ui-error/40 bg-ui-surface-muted p-4 text-sm text-ui-error"
            >
              <p>{getApiErrorMessage(teamQuery.error, 'Unable to load team accounts.')}</p>
              <button
                type="button"
                onClick={() => void teamQuery.refetch()}
                className="rounded-lg border border-ui-border bg-ui-surface px-3 py-1.5 text-xs font-semibold text-ui-text hover:bg-ui-surface-muted"
              >
                Retry
              </button>
            </div>
          ) : members.length === 0 ? (
            <p className="py-10 text-center text-sm text-ui-text-muted">
              No Staff Portal accounts found.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-ui-border">
              {members.map((member) => {
                const isSelf = member.id === currentUserId;
                const isPending = pendingUserIds.has(member.id);
                return (
                  <li
                    key={member.id}
                    className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ui-text">
                          {member.email}
                        </span>
                        {isSelf ? (
                          <span className="rounded-md border border-ui-border bg-ui-surface-muted px-2 py-0.5 text-xs font-medium text-ui-text-muted">
                            You
                          </span>
                        ) : null}
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                            member.active
                              ? 'bg-ui-accent/15 text-ui-accent'
                              : 'border border-ui-border bg-ui-surface-muted text-ui-text-muted'
                          }`}
                        >
                          {member.active ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      <p className="text-xs text-ui-text-muted">
                        {ADMIN_ROLE_LABELS[member.role]} ·{' '}
                        {member.role === 'owner' ? 'Full access' : 'Customer Orders & Menu Stock'}
                      </p>
                    </div>

                    {isSelf ? (
                      <span className="shrink-0 text-xs font-medium text-ui-text-muted">
                        Signed-in owner
                      </span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={`Role for ${member.email}`}
                          value={member.role}
                          disabled={isPending}
                          onChange={(event) =>
                            void handleRoleChange(member, event.target.value as AdminRole)
                          }
                          className="rounded-xl border border-ui-border bg-ui-canvas px-2.5 py-1.5 text-xs font-semibold text-ui-text disabled:opacity-60"
                        >
                          {ADMIN_ROLE_VALUES.map((value) => (
                            <option key={value} value={value}>
                              {ADMIN_ROLE_LABELS[value]}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => void handleToggleActive(member)}
                          className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none disabled:opacity-60 ${
                            member.active
                              ? 'border-ui-error/40 text-ui-error hover:bg-ui-surface-muted'
                              : 'border-ui-border bg-ui-surface text-ui-text hover:bg-ui-surface-muted'
                          }`}
                        >
                          {member.active ? 'Disable access' : 'Re-enable access'}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
