import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function UnstableChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Simulated render failure');
  }
  return <p>Healthy child content</p>;
}

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary fallback={<p role="alert">Something went wrong</p>}>
        <UnstableChild shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Healthy child content')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('catches render errors, shows the fallback, and recovers via reset', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onReset = vi.fn();
    let shouldThrow = true;

    function ControlledChild() {
      return <UnstableChild shouldThrow={shouldThrow} />;
    }

    render(
      <ErrorBoundary
        onReset={onReset}
        fallback={(reset) => (
          <div role="alert">
            <p>Panel failed to load</p>
            <button type="button" onClick={reset}>
              Retry
            </button>
          </div>
        )}
      >
        <ControlledChild />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert').textContent).toContain('Panel failed to load');

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onReset).toHaveBeenCalledOnce();
    expect(screen.getByText('Healthy child content')).toBeTruthy();
  });
});
