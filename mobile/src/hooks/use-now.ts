import { useSyncExternalStore } from 'react';
import { AppState, type NativeEventSubscription } from 'react-native';

import { todayKey } from '@/lib/dates';

/*
 * The time, for clocks on screen: one timer for the whole app, ticking on
 * the minute while anything shows it.
 */

let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let appState: NativeEventSubscription | null = null;

function tick() {
  if (timer) clearTimeout(timer);
  now = Date.now();
  listeners.forEach((l) => l());
  timer = setTimeout(tick, 60_000 - (now % 60_000) + 50);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setTimeout(tick, 60_000 - (now % 60_000) + 50);
    // Timers sleep while the app is away: catch up the moment it is back,
    // so a day that ended meanwhile turns over at once.
    appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearTimeout(timer);
      timer = null;
      appState?.remove();
      appState = null;
    }
  };
}

const snapshot = () => now;

/** The time now, as a Date, changing each minute. */
export function useNow() {
  return new Date(useSyncExternalStore(subscribe, snapshot, snapshot));
}

/**
 * Today on this phone as YYYY-MM-DD, turning over at midnight even while the
 * app stays open (or comes back from the background the next morning).
 */
export function useToday() {
  // A string snapshot: screens draw again only when the day changes.
  return useSyncExternalStore(subscribe, daySnapshot, daySnapshot);
}

const daySnapshot = () => todayKey(new Date(now));
