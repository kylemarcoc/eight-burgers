import { useSyncExternalStore } from 'react';

let activeForegroundRequests = 0;
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function beginForegroundRequest(): () => void {
  activeForegroundRequests += 1;
  emitChange();

  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    activeForegroundRequests = Math.max(0, activeForegroundRequests - 1);
    emitChange();
  };
}

export function endForegroundRequest(): void {
  if (activeForegroundRequests <= 0) return;
  activeForegroundRequests -= 1;
  emitChange();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): number {
  return activeForegroundRequests;
}

export function useForegroundRequestCount(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
