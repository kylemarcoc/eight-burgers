import { useEffect, useEffectEvent, useState, type ComponentPropsWithRef } from 'react';

export type PasswordInputProps = Omit<ComponentPropsWithRef<'input'>, 'type' | 'id'> & {
  id: string;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
};

/**
 * Hardened password field with an inline trailing show/hide toggle placed after the input in DOM
 * order for natural keyboard navigation, disabled spellcheck/autocapitalize/autocorrect when
 * revealed, suppressed Edge native reveal icons, polite screen-reader toggle announcements, and
 * automatic masking when the tab becomes hidden on shared devices.
 */
export function PasswordInput({
  id,
  visible,
  onVisibleChange,
  disabled,
  className,
  ref,
  ...inputProps
}: PasswordInputProps) {
  const [lastToggledTo, setLastToggledTo] = useState<boolean | null>(null);
  const handleHideOnTabSwitch = useEffectEvent(() => {
    onVisibleChange(false);
  });

  useEffect(() => {
    if (!visible) return;
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        handleHideOnTabSwitch();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [visible]);

  const statusAnnouncement =
    lastToggledTo === visible ? (visible ? 'Password shown.' : 'Password hidden.') : '';

  function handleToggle() {
    const nextVisible = !visible;
    setLastToggledTo(nextVisible);
    onVisibleChange(nextVisible);
  }

  return (
    <div className="relative mt-1">
      <input
        {...inputProps}
        ref={ref}
        id={id}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className={[
          'w-full rounded-xl border border-ui-border bg-ui-canvas py-2 pr-18 pl-3 text-sm text-ui-text [&::-ms-clear]:hidden [&::-ms-reveal]:hidden',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        aria-controls={id}
        className="absolute inset-y-1 right-1 inline-flex min-w-12 items-center justify-center rounded-lg px-2.5 text-xs font-medium text-ui-accent hover:bg-ui-surface-muted hover:text-ui-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>
          {visible ? 'Hide' : 'Show'} <span className="sr-only">password</span>
        </span>
      </button>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {statusAnnouncement}
      </span>
    </div>
  );
}
