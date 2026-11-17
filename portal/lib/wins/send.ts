import { waitUntil } from '@vercel/functions';

import { db } from '@/lib/mongodb/db-client';
import { localClock } from '@/lib/push/dayReminders';
import { sendPushToUsers } from '@/lib/push/server';

/*
 * Wins: the encouraging notifications for goals met, streaks, levels,
 * badges and big tasks (./triggers.ts, ./scheduled.ts).
 *
 * Every win is saved once per person (its id is `<userId>:<key>`, so a
 * second save of the same key fails and nothing is sent twice). It shows
 * as a celebration card the next time the person opens the portal or the
 * app (GET /api/me/wins), and is also pushed to their devices unless:
 * - they turned "Wins and streaks" off (Subscription.winsOff),
 * - it is quiet hours where they are (22:30 to 08:00), or
 * - they already got DAILY_CAP win pushes today.
 * Held-back wins still show as a card.
 */

export const DAILY_CAP = 2;
const QUIET_FROM = 22 * 60 + 30;
const QUIET_UNTIL = 8 * 60;

export type WinKind =
  | 'goal-met'
  | 'goal-last-push'
  | 'target'
  | 'streak'
  | 'best-streak'
  | 'level'
  | 'badge'
  | 'big-task'
  | 'recap';

export type Win = {
  id: string;
  userId: string;
  key: string;
  kind: WinKind;
  emoji: string;
  title: string;
  body: string;
  /** The page it is about. */
  url: string;
  /** The person's local day it was saved on. */
  date: string;
  pushed: boolean;
  seenAt?: string | null;
  createdAt: string;
};

export type WinInput = Pick<
  Win,
  'key' | 'kind' | 'emoji' | 'title' | 'body' | 'url'
> & {
  /** Nudges (not celebrations) show no card. */
  card?: boolean;
};

/** Runs work after the response, so the person isn't kept waiting. */
export function later(work: () => Promise<unknown>) {
  const run = work().catch((error) => console.error('[wins]', error));
  try {
    waitUntil(run);
  } catch {
    // Not on Vercel: it simply runs on.
  }
}

/** Whether the person turned win notifications off. */
export async function winsOff(userId: string) {
  const sub = await db.subscription.findUnique({ where: { userId } });
  return !!sub?.winsOff;
}

export async function setWinsOff(userId: string, off: boolean) {
  await db.subscription.upsert({
    where: { userId },
    update: { winsOff: off },
    create: { userId, subscriptions: [], winsOff: off },
  });
}

/**
 * Saves a win for each person and pushes it to those it may reach now.
 * People who already have this win (same key) are skipped.
 */
export async function announceWin(userIds: string[], win: WinInput) {
  const people = Array.from(new Set(userIds.filter(Boolean)));
  if (!people.length) return 0;
  const users: { id: string; timezone?: string | null; status?: string }[] =
    await db.user.findMany({
      where: { id: { in: people } },
      select: { id: true, timezone: true, status: true },
    });
  let sent = 0;
  const now = new Date();
  for (const user of users) {
    if (user.status && user.status !== 'ACTIVE') continue;
    try {
      if (await winsOff(user.id)) continue;
      const { date, minutes } = localClock(user.timezone, now);
      const quiet = minutes >= QUIET_FROM || minutes < QUIET_UNTIL;
      const today = quiet
        ? DAILY_CAP
        : await db.win.count({
            where: { userId: user.id, date, pushed: true },
          });
      const push = today < DAILY_CAP;
      try {
        await db.win.create({
          data: {
            id: `${user.id}:${win.key}`,
            userId: user.id,
            key: win.key,
            kind: win.kind,
            emoji: win.emoji,
            title: win.title,
            body: win.body,
            url: win.url,
            date,
            pushed: push,
            // A nudge has nothing to celebrate on a card.
            seenAt: win.card === false ? now.toISOString() : null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        });
      } catch {
        continue; // Already had this one.
      }
      if (!push) continue;
      await sendPushToUsers([user.id], {
        title: `${win.emoji} ${win.title}`,
        body: win.body,
        url: win.url,
        tag: `win-${win.key}`,
      });
      sent++;
    } catch (error) {
      console.error('[wins] announce failed for', user.id, error);
    }
  }
  return sent;
}

/** Wins not yet seen on a card, newest first (the last week). */
export async function unseenWins(userId: string): Promise<Win[]> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  return db.win.findMany({
    where: { userId, seenAt: null, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
}

export async function markWinsSeen(userId: string, ids: string[]) {
  if (!ids.length) return;
  await db.win.updateMany({
    where: { userId, id: { in: ids } },
    data: { seenAt: new Date().toISOString() },
  });
}
