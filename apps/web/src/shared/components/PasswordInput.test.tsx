import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasswordInput } from './PasswordInput';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function PasswordInputHarness({ initialVisible = false }: { initialVisible?: boolean }) {
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(initialVisible);

  return (
    <div>
      <label htmlFor="test-password">Password</label>
      <PasswordInput
        id="test-password"
        name="password"
        autoComplete="current-password"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        visible={visible}
        onVisibleChange={setVisible}
      />
      <button type="button" onClick={() => setVisible(false)}>
        Reset visibility
      </button>
    </div>
  );
}

describe('PasswordInput', () => {
  it('places the toggle button after the input in DOM order and sets hardened input attributes', () => {
    render(<PasswordInputHarness />);

    const input = screen.getByLabelText(/^password$/i) as HTMLInputElement;
    const toggle = screen.getByRole('button', { name: /show password/i });

    expect(input.type).toBe('password');
    expect(input.getAttribute('spellcheck')).toBe('false');
    expect(input.getAttribute('autocapitalize')).toBe('none');
    expect(input.getAttribute('autocorrect')).toBe('off');
    expect(toggle.getAttribute('aria-controls')).toBe('test-password');
    expect(Boolean(input.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(
      true,
    );
  });

  it('announces visibility changes politely after user toggles and stays silent on mount or reset', () => {
    const { container } = render(<PasswordInputHarness />);
    const liveRegion = container.querySelector('[aria-live="polite"]');

    expect(liveRegion?.textContent).toBe('');

    fireEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect((screen.getByLabelText(/^password$/i) as HTMLInputElement).type).toBe('text');
    expect(liveRegion?.textContent).toBe('Password shown.');

    fireEvent.click(screen.getByRole('button', { name: /hide password/i }));
    expect((screen.getByLabelText(/^password$/i) as HTMLInputElement).type).toBe('password');
    expect(liveRegion?.textContent).toBe('Password hidden.');

    fireEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(liveRegion?.textContent).toBe('Password shown.');

    fireEvent.click(screen.getByRole('button', { name: /reset visibility/i }));
    expect((screen.getByLabelText(/^password$/i) as HTMLInputElement).type).toBe('password');
    expect(liveRegion?.textContent).toBe('');
  });

  it('automatically masks a revealed password when the browser tab becomes hidden', () => {
    render(<PasswordInputHarness />);

    const input = screen.getByLabelText(/^password$/i) as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(input.type).toBe('text');

    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    try {
      fireEvent(document, new Event('visibilitychange'));
      expect(input.type).toBe('password');
      expect(screen.getByRole('button', { name: /show password/i })).toBeTruthy();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(document, 'visibilityState', originalDescriptor);
      } else {
        delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState;
      }
    }
  });

  it('does not re-subscribe the document visibility listener across typing renders with an inline callback', () => {
    const addListenerSpy = vi.spyOn(document, 'addEventListener');
    function InlineCallbackHarness() {
      const [value, setValue] = useState('');
      const [visible, setVisible] = useState(true);
      return (
        <PasswordInput
          id="inline-password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          visible={visible}
          onVisibleChange={(next) => setVisible(next)}
        />
      );
    }

    render(<InlineCallbackHarness />);
    const initialCalls = addListenerSpy.mock.calls.filter(
      ([eventName]) => eventName === 'visibilitychange',
    ).length;
    expect(initialCalls).toBe(1);

    const input = document.getElementById('inline-password') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.change(input, { target: { value: 'abcdef' } });

    const afterTypingCalls = addListenerSpy.mock.calls.filter(
      ([eventName]) => eventName === 'visibilitychange',
    ).length;
    expect(afterTypingCalls).toBe(1);
  });
});
