type OverlayId = symbol | string;

type OverlayEntry = {
  id: OverlayId;
  portalElement: HTMLElement | null;
  priority: number;
};

type SavedElementState = {
  hadInert: boolean;
  prevAriaHidden: string | null;
};

const activeOverlays: OverlayEntry[] = [];
const savedElementStates = new Map<HTMLElement, SavedElementState>();
const overlayListeners = new Set<() => void>();
let savedBodyOverflow: string | null = null;
let currentTopmostId: OverlayId | null = null;

function getTopmostOverlay(): OverlayEntry | null {
  let topmost: OverlayEntry | null = null;
  for (const entry of activeOverlays) {
    if (!topmost || entry.priority >= topmost.priority) {
      topmost = entry;
    }
  }
  return topmost;
}

function notifyOverlayListeners(): void {
  const nextTopmostId = getTopmostOverlay()?.id ?? null;
  if (nextTopmostId !== currentTopmostId) {
    currentTopmostId = nextTopmostId;
    for (const listener of overlayListeners) {
      listener();
    }
  }
}

function restoreElementState(element: HTMLElement, saved: SavedElementState): void {
  if (!saved.hadInert) {
    element.removeAttribute('inert');
  }
  if (saved.prevAriaHidden === null) {
    element.removeAttribute('aria-hidden');
  } else {
    element.setAttribute('aria-hidden', saved.prevAriaHidden);
  }
}

function syncOverlayDom(): void {
  if (typeof document === 'undefined' || !document.body) {
    return;
  }

  // Prune any elements detached while an overlay was open
  for (const [element] of savedElementStates) {
    if (!element.isConnected) {
      savedElementStates.delete(element);
    }
  }

  const topmost = getTopmostOverlay();

  if (!topmost) {
    if (savedBodyOverflow !== null) {
      document.body.style.overflow = savedBodyOverflow;
      savedBodyOverflow = null;
    }
    for (const [element, saved] of savedElementStates) {
      restoreElementState(element, saved);
    }
    savedElementStates.clear();
    return;
  }

  if (savedBodyOverflow === null) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  const activePortal = topmost.portalElement;
  if (!activePortal || !document.body.contains(activePortal)) {
    for (const [element, saved] of savedElementStates) {
      restoreElementState(element, saved);
    }
    savedElementStates.clear();
    return;
  }

  for (const child of Array.from(document.body.children)) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }

    const isExempt =
      child === activePortal ||
      child.contains(activePortal) ||
      child.hasAttribute('data-overlay-exempt');

    if (isExempt) {
      const saved = savedElementStates.get(child);
      if (saved) {
        restoreElementState(child, saved);
        savedElementStates.delete(child);
      }
      continue;
    }

    if (!savedElementStates.has(child)) {
      savedElementStates.set(child, {
        hadInert: child.hasAttribute('inert'),
        prevAriaHidden: child.getAttribute('aria-hidden'),
      });
    }
    child.setAttribute('inert', '');
    child.setAttribute('aria-hidden', 'true');
  }
}

export type OverlayLockHandle = {
  isTopmost: () => boolean;
  release: () => void;
};

export function subscribeOverlayLocks(listener: () => void): () => void {
  overlayListeners.add(listener);
  return () => {
    overlayListeners.delete(listener);
  };
}

export function getTopmostOverlayId(): OverlayId | null {
  return getTopmostOverlay()?.id ?? null;
}

export function acquireOverlayLock(
  portalElement: HTMLElement | null,
  options?: { id?: OverlayId; priority?: number },
): OverlayLockHandle {
  const id = options?.id ?? Symbol('overlay-lock');
  const priority = options?.priority ?? 0;

  activeOverlays.push({ id, portalElement, priority });
  syncOverlayDom();
  notifyOverlayListeners();

  let released = false;
  return {
    isTopmost: () => {
      if (released) return false;
      return getTopmostOverlay()?.id === id;
    },
    release: () => {
      if (released) return;
      released = true;
      const index = activeOverlays.findIndex((entry) => entry.id === id);
      if (index !== -1) {
        activeOverlays.splice(index, 1);
      }
      syncOverlayDom();
      notifyOverlayListeners();
    },
  };
}

export function resetOverlayLocks(): void {
  activeOverlays.length = 0;
  syncOverlayDom();
  notifyOverlayListeners();
}
