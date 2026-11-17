import { db } from '@/lib/mongodb/db-client';
import { localClock } from '@/lib/push/dayReminders';
import { usersWithPhones } from '@/lib/push/expo';
import { tallyRowsFor } from '@/lib/workspace/goalTally';
import type { DoneTask } from '@/lib/workspace/projects';
import {
  addDays,
  goalProgress,
  isTarget,
  mondayOf,
  PERIOD_NOUN,
  periodRange,
  toDay,
} from '@/lib/workspace/projects';
import { USERSTATUS } from '@/models/shared/enums';
import type { Project } from '@/models/workspace';
import { PROJECT_STATUS, TASK_STATUS } from '@/models/workspace';

import { announceWin } from './send';
import { streakInfo } from './triggers';

/*
 * The evening wins run (/api/cron/wins, 12:30 UTC = 18:00 IST):
 * - Last push: on the last day of a goal's week, fortnight, month or
 *   quarter, when it is one short, the people it is for get a nudge.
 * - Friday recap: on Friday, what each person got done this week.
 */

/** People who can get a push: a browser subscription or the app. */
async function reachable(): Promise<
  Map<string, { id: string; timezone?: string | null }>
> {
  const [subs, phones] = await Promise.all([
    db.subscription.findMany({}) as Promise<
      { userId: string; subscriptions?: unknown[] }[]
    >,
    usersWithPhones(),
  ]);
  const ids = Array.from(
    new Set([
      ...subs.filter((s) => s.subscriptions?.length).map((s) => s.userId),
      ...phones,
    ]),
  );
  if (!ids.length) return new Map();
  const users: { id: string; timezone?: string | null; status?: string }[] =
    await db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, timezone: true, status: true },
    });
  return new Map(
    users.filter((u) => u.status === USERSTATUS.ACTIVE).map((u) => [u.id, u]),
  );
}

async function lastPush(people: Set<string>) {
  const today = toDay();
  const projects: Project[] = await db.project.findMany({
    where: { status: { notIn: [PROJECT_STATUS.ARCHIVED] } },
  });
  const withGoals = projects.filter((p) =>
    (p.goals ?? []).some((g) => !isTarget(g) && g.period !== 'day'),
  );
  if (!withGoals.length) return 0;
  const ids = withGoals.map((p) => p.id);
  const [tasks, tallies]: [DoneTask[], DoneTask[]] = await Promise.all([
    db.task.findMany({
      where: {
        projectId: { in: ids },
        status: TASK_STATUS.DONE,
        goalId: {
          in: withGoals.flatMap((p) => (p.goals ?? []).map((g) => g.id)),
        },
      },
      select: {
        status: true,
        goalId: true,
        goalPartId: true,
        forDate: true,
        completedAt: true,
      },
    }),
    tallyRowsFor(ids),
  ]);
  let sent = 0;
  for (const project of withGoals) {
    for (const goal of project.goals ?? []) {
      if (isTarget(goal) || goal.period === 'day') continue;
      const range = periodRange(goal.period, today, goal.since);
      if (range.to !== today) continue;
      const [p] = goalProgress([goal], [...tasks, ...tallies], today);
      if (p.target - p.done !== 1) continue;
      const team = goal.assigneeIds?.length
        ? goal.assigneeIds
        : [...(project.leadIds ?? []), ...(project.memberIds ?? [])];
      const noun = PERIOD_NOUN[goal.period];
      sent += await announceWin(
        team.filter((id) => people.has(id)),
        {
          key: `last-push:${goal.id}:${range.from}`,
          kind: 'goal-last-push',
          emoji: '💪',
          title: `One more for this ${noun}'s goal`,
          body: `${goal.title} on ${project.name}: ${p.done}/${p.target}. You've got tonight.`,
          url: `/projects/${project.id}`,
          card: false,
        },
      );
    }
  }
  return sent;
}

async function fridayRecap(
  users: Map<string, { id: string; timezone?: string | null }>,
  now: Date,
) {
  let sent = 0;
  for (const user of Array.from(users.values())) {
    const { date } = localClock(user.timezone, now);
    if (new Date(`${date}T00:00:00Z`).getUTCDay() !== 5) continue;
    const monday = mondayOf(date);
    const points: { date: string; status?: string | null; taskId: string }[] =
      await db.workPoint.findMany({
        where: {
          userId: user.id,
          date: { gte: addDays(date, -400), lte: date },
        },
        select: { date: true, status: true, taskId: true },
      });
    const week = points.filter((p) => p.date >= monday);
    if (!week.length) continue;
    const done = new Set(
      week.filter((p) => p.status === 'done').map((p) => p.taskId),
    ).size;
    const days = new Set(week.map((p) => p.date)).size;
    const allDays = Array.from(new Set(points.map((p) => p.date)))
      .sort()
      .reverse();
    const { current } = streakInfo(allDays, date);
    const parts = [
      done ? `${done} task${done === 1 ? '' : 's'} done` : null,
      `${days} day${days === 1 ? '' : 's'} logged`,
      current >= 3 ? `${current}-day streak` : null,
    ].filter(Boolean);
    sent += await announceWin([user.id], {
      key: `recap:${monday}`,
      kind: 'recap',
      emoji: '🌟',
      title: done >= 10 ? 'What a week!' : 'Your week in wins',
      body: `This week: ${parts.join(', ')}. Have a good weekend.`,
      url: '/user/worklogs',
    });
  }
  return sent;
}

export async function runWinsCron(now = new Date()) {
  const users = await reachable();
  const people = new Set(users.keys());
  const [nudges, recaps] = await Promise.all([
    lastPush(people).catch((e) => {
      console.error('[wins] last push failed', e);
      return 0;
    }),
    fridayRecap(users, now).catch((e) => {
      console.error('[wins] recap failed', e);
      return 0;
    }),
  ]);
  return { nudges, recaps };
}
