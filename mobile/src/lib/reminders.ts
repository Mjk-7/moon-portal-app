import { useQuery } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';

import { api } from './api';
import { fromKey } from './dates';
import { usePreferences } from './preferences';
import { type PushData, preparePush } from './push';
import { isOpen } from './tasks';
import type { MyTasks, Task, UpcomingMeeting } from './types';

/*
 * Reminders made on the phone, so they arrive on time even offline: at 9 am
 * on the day an open task of theirs is due, with a Done button, and for each
 * confirmed meeting 15 minutes before and again when it starts (tapping that
 * one joins the call). They follow the person's tasks and meetings
 * (/api/me/meetings): every time either changes, reminders that no longer fit
 * are taken off and new ones are set. The website does the same in an open
 * portal tab (portal/components/global/MeetingReminders.tsx).
 */

const PREFIX = 'reminder-';
/** iPhones keep at most 64 waiting notifications per app. */
const MAX = 40;
const DUE_HOUR = 9;
const MEETING_LEAD_MINUTES = 15;

type Reminder = {
  id: string;
  at: Date;
  title: string;
  body: string;
  data: PushData;
  /** Shows the Done button. */
  task: boolean;
};

/** A short fingerprint, so a renamed task gets a fresh reminder. */
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

export function remindersFor(tasks: Task[], meetings: UpcomingMeeting[] = [], now = new Date()): Reminder[] {
  const list: Reminder[] = [];
  for (const m of meetings) {
    const start = new Date(m.start);
    if (Number.isNaN(start.getTime())) continue;
    const who = `${m.interview ? 'Interview' : 'Meeting'} with ${m.with}`;
    const key = `${PREFIX}meet-${m.bookingId}-${start.getTime().toString(36)}`;
    const soon = new Date(start.getTime() - MEETING_LEAD_MINUTES * 60_000);
    if (soon > now)
      list.push({
        id: `${key}-soon`,
        at: soon,
        title: `${who} in ${MEETING_LEAD_MINUTES} minutes`,
        body: m.joinUrl ? `${m.time} · Tap to see the details` : m.time,
        data: { url: m.url },
        task: false,
      });
    if (start > now)
      list.push({
        id: `${key}-now`,
        at: start,
        title: `${who} is starting now`,
        body: m.joinUrl ? 'Tap to join the call' : m.time,
        data: { url: m.url, joinUrl: m.joinUrl },
        task: false,
      });
  }
  for (const t of tasks) {
    // Meetings come from the meetings list above.
    if (t.meetBookingId) continue;
    if (!isOpen(t) || !t.dueDate) continue;
    const day = t.dueDate.slice(0, 10);
    const at = fromKey(day);
    if (Number.isNaN(at.getTime())) continue;
    at.setHours(DUE_HOUR, 0, 0, 0);
    if (at <= now) continue;
    list.push({
      id: `${PREFIX}due-${t.id}-${day}-${hash(t.title)}`,
      at,
      title: 'Due today',
      body: t.title,
      data: { url: `/task/${t.id}`, taskId: t.id },
      task: true,
    });
  }
  return list.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX);
}

const ours = async () =>
  (await Notifications.getAllScheduledNotificationsAsync()).filter((n) =>
    n.identifier.startsWith(PREFIX),
  );

async function sync(reminders: Reminder[]) {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;
  await preparePush();
  const wanted = new Set(reminders.map((r) => r.id));
  const set = await ours();
  await Promise.all(
    set
      .filter((n) => !wanted.has(n.identifier))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  const have = new Set(set.map((n) => n.identifier));
  for (const r of reminders) {
    if (have.has(r.id)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: {
        title: r.title,
        body: r.body,
        data: r.data,
        sound: 'default',
        ...(r.task && { categoryIdentifier: 'task' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: r.at,
        channelId: 'default',
      },
    });
  }
}

/** Takes every reminder off (signed out, or reminders turned off). */
export async function clearReminders() {
  if (Platform.OS === 'web') return;
  const set = await ours().catch(() => []);
  await Promise.all(set.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))).catch(
    () => null,
  );
}

/** Keeps the phone's reminders in step with the person's tasks. */
export function useTaskReminders() {
  const { reminders: on } = usePreferences();
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: () => api<MyTasks>('/api/me/tasks') });
  const meetings = useQuery({
    queryKey: ['meetings', 'upcoming'],
    queryFn: () => api<{ meetings: UpcomingMeeting[] }>('/api/me/meetings'),
    enabled: on,
    // Picks up meetings booked or moved since, while the app is open.
    refetchInterval: 5 * 60_000,
  });
  const list = useMemo(
    () =>
      on && tasks.data
        ? remindersFor(tasks.data.tasks, meetings.data?.meetings ?? [])
        : null,
    [on, tasks.data, meetings.data],
  );
  const key = list?.map((r) => r.id).join('|');

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!on) void clearReminders();
    else if (list) void sync(list).catch(() => null);
    // `key` stands for the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, key]);
}
