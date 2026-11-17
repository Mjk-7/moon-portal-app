'use client';

import { useEffect } from 'react';

import type { UpcomingMeeting } from '@/lib/meet/upcoming';
import { useUser } from '@/utils/hooks/useUser';

/*
 * Meeting reminders in the browser: a notification 15 minutes before each
 * confirmed meeting and another when it starts, with a Join button. The
 * phone app sets the same two on the phone itself (mobile/src/lib/reminders.ts).
 *
 * Browsers can't schedule a notification ahead of time, so this works while
 * a portal tab is open (in the background is fine). It reloads the meetings
 * every few minutes and when the tab comes back into view. Several open tabs
 * show each reminder once: the first to fire notes it in localStorage, and
 * the notification's tag stops a second one stacking up.
 */

const LEAD_MINUTES = 15;
const REFRESH_MS = 5 * 60_000;
/** A reminder this late (the laptop was asleep) is still worth showing. */
const GRACE_MS = 5 * 60_000;
/** setTimeout can't wait longer than ~24 days; we only plan a day ahead. */
const PLAN_AHEAD_MS = 24 * 60 * 60_000;
const SEEN_KEY = 'meeting-reminders-shown';

type Reminder = {
  id: string;
  at: number;
  title: string;
  body: string;
  url: string;
  joinUrl: string | null;
};

export function meetingReminders(meetings: UpcomingMeeting[]): Reminder[] {
  const list: Reminder[] = [];
  for (const m of meetings) {
    const start = new Date(m.start).getTime();
    if (Number.isNaN(start)) continue;
    const what = m.interview ? 'Interview' : 'Meeting';
    const who = `${what} with ${m.with}`;
    list.push(
      {
        id: `${m.bookingId}-${start}-soon`,
        at: start - LEAD_MINUTES * 60_000,
        title: `${who} in ${LEAD_MINUTES} minutes`,
        body: `${m.time}. ${m.joinUrl ? 'Tap Join when you are ready.' : 'Get set up.'}`,
        url: m.url,
        joinUrl: m.joinUrl,
      },
      {
        id: `${m.bookingId}-${start}-now`,
        at: start,
        title: `${who} is starting now`,
        body: m.joinUrl ? 'Tap to join the call.' : m.time,
        url: m.joinUrl ?? m.url,
        joinUrl: m.joinUrl,
      },
    );
  }
  return list;
}

const readSeen = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
  } catch {
    return {};
  }
};

/** Notes a reminder as shown; false when another tab already showed it. */
const claim = (id: string) => {
  try {
    const seen = readSeen();
    if (seen[id]) return false;
    const now = Date.now();
    // Keep a week of history.
    for (const k of Object.keys(seen))
      if (seen[k] < now - 7 * 86_400_000) delete seen[k];
    seen[id] = now;
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    return true;
  } catch {
    return true;
  }
};

async function show(r: Reminder) {
  if (!('Notification' in window) || Notification.permission !== 'granted')
    return;
  if (!claim(r.id)) return;
  const registration =
    'serviceWorker' in navigator
      ? await navigator.serviceWorker.getRegistration()
      : undefined;
  const options = {
    body: r.body,
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: `meet-reminder-${r.id}`,
    requireInteraction: r.id.endsWith('-now'),
    data: {
      url: r.url,
      actionUrls: r.joinUrl ? { join: r.joinUrl } : {},
    },
    ...(r.joinUrl && { actions: [{ action: 'join', title: 'Join' }] }),
  } as NotificationOptions;
  if (registration) {
    await registration.showNotification(r.title, options);
    return;
  }
  // No service worker (local development): a plain notification.
  const n = new Notification(r.title, options);
  n.onclick = () => {
    window.focus();
    window.location.href = r.url;
  };
}

export const MeetingReminders = () => {
  const { user } = useUser();
  const userId = user?.id;

  useEffect(() => {
    if (!userId || typeof window === 'undefined' || !('Notification' in window))
      return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let stopped = false;

    const plan = (meetings: UpcomingMeeting[]) => {
      timers.forEach(clearTimeout);
      timers = [];
      const now = Date.now();
      for (const r of meetingReminders(meetings)) {
        if (r.at < now - GRACE_MS || r.at > now + PLAN_AHEAD_MS) continue;
        timers.push(
          setTimeout(
            () => void show(r).catch(() => null),
            Math.max(0, r.at - now),
          ),
        );
      }
    };

    const load = async () => {
      if (Notification.permission !== 'granted') return;
      try {
        const res = await fetch('/api/me/meetings', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (!stopped) plan(json?.data?.meetings ?? []);
      } catch {
        // Offline: keep what is planned and try again later.
      }
    };

    void load();
    const every = setInterval(load, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
      clearInterval(every);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId]);

  return null;
};
