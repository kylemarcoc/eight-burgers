import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acquireOverlayLock,
  getTopmostOverlayId,
  resetOverlayLocks,
  subscribeOverlayLocks,
} from './overlay-lock';

function createBodyChild(id: string): HTMLDivElement {
  const el = document.createElement('div');
  el.id = id;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  resetOverlayLocks();
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('overlay-lock', () => {
  it('locks scroll, isolates non-exempt body siblings, and restores pre-existing attributes on release', () => {
    document.body.style.overflow = 'auto';
    const root = createBodyChild('root');
    const preHidden = createBodyChild('pre-hidden');
    preHidden.setAttribute('aria-hidden', 'true');
    preHidden.setAttribute('inert', '');
    const exempt = createBodyChild('top-bar');
    exempt.setAttribute('data-overlay-exempt', 'true');
    const modal = createBodyChild('modal');

    const lock = acquireOverlayLock(modal);

    expect(lock.isTopmost()).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    expect(root.hasAttribute('inert')).toBe(true);
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(modal.hasAttribute('inert')).toBe(false);
    expect(exempt.hasAttribute('inert')).toBe(false);
    expect(exempt.getAttribute('aria-hidden')).toBeNull();

    lock.release();
    // Releasing twice is a safe no-op
    lock.release();

    expect(lock.isTopmost()).toBe(false);
    expect(document.body.style.overflow).toBe('auto');
    expect(root.hasAttribute('inert')).toBe(false);
    expect(root.getAttribute('aria-hidden')).toBeNull();
    expect(preHidden.hasAttribute('inert')).toBe(true);
    expect(preHidden.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps scroll locked and #root isolated when a lower overlay closes before a higher-priority backdrop (non-LIFO)', () => {
    const root = createBodyChild('root');
    const drawer = createBodyChild('drawer');
    const backdrop = createBodyChild('backdrop');

    const drawerLock = acquireOverlayLock(drawer, { priority: 0 });
    const backdropLock = acquireOverlayLock(backdrop, { priority: 100 });

    expect(drawerLock.isTopmost()).toBe(false);
    expect(backdropLock.isTopmost()).toBe(true);
    expect(drawer.hasAttribute('inert')).toBe(true);
    expect(drawer.getAttribute('aria-hidden')).toBe('true');
    expect(root.hasAttribute('inert')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    // Drawer closes BEFORE backdrop finishes
    drawerLock.release();
    drawer.remove();

    expect(backdropLock.isTopmost()).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    expect(root.hasAttribute('inert')).toBe(true);
    expect(root.getAttribute('aria-hidden')).toBe('true');

    // Backdrop finally finishes -> full restoration with no leaked overflow: hidden
    backdropLock.release();

    expect(document.body.style.overflow).toBe('');
    expect(root.hasAttribute('inert')).toBe(false);
    expect(root.getAttribute('aria-hidden')).toBeNull();
  });

  it('keeps higher-priority backdrop topmost if a lower modal opens underneath and promotes the modal when the backdrop closes', () => {
    const root = createBodyChild('root');
    const backdrop = createBodyChild('backdrop');
    const modal = createBodyChild('modal');

    const backdropLock = acquireOverlayLock(backdrop, { priority: 100 });
    const modalLock = acquireOverlayLock(modal, { priority: 0 });

    expect(backdropLock.isTopmost()).toBe(true);
    expect(modalLock.isTopmost()).toBe(false);
    expect(modal.hasAttribute('inert')).toBe(true);
    expect(root.hasAttribute('inert')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    // Backdrop closes first -> modal becomes topmost and interactive, #root stays isolated
    backdropLock.release();
    backdrop.remove();

    expect(modalLock.isTopmost()).toBe(true);
    expect(modal.hasAttribute('inert')).toBe(false);
    expect(modal.getAttribute('aria-hidden')).toBeNull();
    expect(root.hasAttribute('inert')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    // Modal closes -> everything cleanly restored
    modalLock.release();

    expect(document.body.style.overflow).toBe('');
    expect(root.hasAttribute('inert')).toBe(false);
    expect(root.getAttribute('aria-hidden')).toBeNull();
  });

  it('exempts an ancestor wrapper containing the active portal and never locks out the document when portalElement is null', () => {
    const root = createBodyChild('root');
    const portalWrapper = createBodyChild('portal-wrapper');
    const nestedModal = document.createElement('div');
    nestedModal.id = 'nested-modal';
    portalWrapper.appendChild(nestedModal);

    const nestedLock = acquireOverlayLock(nestedModal);
    expect(root.hasAttribute('inert')).toBe(true);
    expect(portalWrapper.hasAttribute('inert')).toBe(false);
    expect(portalWrapper.getAttribute('aria-hidden')).toBeNull();
    nestedLock.release();

    const nullPortalLock = acquireOverlayLock(null);
    expect(document.body.style.overflow).toBe('hidden');
    expect(root.hasAttribute('inert')).toBe(false);
    expect(root.getAttribute('aria-hidden')).toBeNull();
    nullPortalLock.release();
    expect(document.body.style.overflow).toBe('');

    const detachedPortal = document.createElement('div');
    const detachedLock = acquireOverlayLock(detachedPortal);
    expect(document.body.style.overflow).toBe('hidden');
    expect(root.hasAttribute('inert')).toBe(false);
    expect(root.getAttribute('aria-hidden')).toBeNull();
    detachedLock.release();
    expect(document.body.style.overflow).toBe('');
  });

  it('notifies subscribers when topmost overlay ID changes on acquire, override, release, and reset', () => {
    const drawer = createBodyChild('drawer');
    const backdrop = createBodyChild('backdrop');
    const listener = vi.fn();
    const unsubscribe = subscribeOverlayLocks(listener);

    expect(getTopmostOverlayId()).toBeNull();

    const drawerLock = acquireOverlayLock(drawer, { id: 'drawer-overlay' });
    expect(drawerLock.isTopmost()).toBe(true);
    expect(getTopmostOverlayId()).toBe('drawer-overlay');
    expect(listener).toHaveBeenCalledTimes(1);

    const backdropLock = acquireOverlayLock(backdrop, { id: 'backdrop-overlay', priority: 100 });
    expect(drawerLock.isTopmost()).toBe(false);
    expect(getTopmostOverlayId()).toBe('backdrop-overlay');
    expect(listener).toHaveBeenCalledTimes(2);

    backdropLock.release();
    expect(drawerLock.isTopmost()).toBe(true);
    expect(getTopmostOverlayId()).toBe('drawer-overlay');
    expect(listener).toHaveBeenCalledTimes(3);

    resetOverlayLocks();
    expect(drawerLock.isTopmost()).toBe(false);
    expect(getTopmostOverlayId()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(4);

    unsubscribe();
    const afterUnsub = acquireOverlayLock(drawer, { id: 'after-unsub' });
    expect(listener).toHaveBeenCalledTimes(4);
    afterUnsub.release();
  });
});
