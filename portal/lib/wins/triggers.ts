import { db } from '@/lib/mongodb/db-client';
import {
  getBuffLevelAndTitle,
  nextBuffLevel,
  workScore,
} from '@/lib/progress/buff';
import { awardAndListBadges, workInRange } from '@/lib/progress/server';
import { localClock } from '@/lib/push/dayReminders';
import { tallyRowsFor } from '@/lib/workspace/goalTally';
import {
  addDays,
  type DoneTask,
  goalHistory,
  goalProgress,
  isTarget,
  PERIOD_NOUN,
  toDay,
} from '@/lib/workspace/projects';
import type { Project, ProjectGoal, Task } from '@/models/workspace';
import { TASK_SIZE, TASK_STATUS } from '@/models/workspace';

import { announceWin, later } from './send';

/*
 * What makes a win, worked out right after the work that earned it:
 * - celebrateWork: any work point logged (streak marks, a new best streak,
 *   a new level this month, new badges);
 * - celebrateTaskDone: a task finished (a big task, a goal met for its
 *   period with how many periods in a row, a target goal passing a mark);
 * - celebrateGoal: progress added to a goal by hand.
 * Each runs after the response (later()), and announceWin keeps any one
 * win from being sent twice.
 */

const STREAK_MARKS = [3, 7, 14, 30, 50, 100, 200, 365];
const TARGET_MARKS = [10, 25, 50, 75, 90, 100];
const WORKLOG_URL = '/user/worklogs';

/* --------------------------------- streaks -------------------------------- */

/** Days the person logged any work on, newest first (the last 400 days). */
async function loggedDays(userId: string, today: string) {
  const points: { date: string }[] = await db.workPoint.findMany({
    where: { userId, date: { gte: addDays(today, -400), lte: today } },
    select: { date: true },
  });
  return Array.from(new Set(points.map((p) => p.date).filter(Boolean)))
    .sort()
    .reverse();
}

/**
 * The run of logged days ending on `end` (0 when `end` has none), the day it
 * started, and the longest run before it.
 */
export function streakInfo(daysNewestFirst: string[], end: string) {
  const days = new Set(daysNewestFirst);
  let current = 0;
  let start = end;
  for (let d = end; days.has(d); d = addDays(d, -1)) {
    current++;
    start = d;
  }
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of [...daysNewestFirst].reverse()) {
    if (d >= start) break;
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, start, best };
}

/** The streak a person would lose tonight: logged days up to yesterday. */
export async function streakBefore(userId: string, today: string) {
  const days = await loggedDays(userId, today);
  return streakInfo(days, addDays(today, -1)).current;
}

async function streakWins(userId: string, today: string) {
  const days = await loggedDays(userId, today);
  const { current, start, best } = streakInfo(days, today);
  if (current < 2) return;
  if (STREAK_MARKS.includes(current)) {
    const week = current === 7;
    await announceWin([userId], {
      key: `streak:${start}:${current}`,
      kind: 'streak',
      emoji: '🔥',
      title: `${current}-day streak!`,
      body: week
        ? 'A full week of logged work. Keep it rolling.'
        : current >= 30
          ? `${current} days in a row of showing up. That's how big things get built.`
          : `${current} days in a row. Momentum is on your side.`,
      url: WORKLOG_URL,
    });
    return;
  }
  // A new personal best: the day it is beaten, then every 5 days past it.
  if (
    best >= 3 &&
    current > best &&
    (current === best + 1 || (current - best) % 5 === 0)
  )
    await announceWin([userId], {
      key: `best-streak:${start}:${current}`,
      kind: 'best-streak',
      emoji: '🏆',
      title: 'New personal best',
      body: `${current} days in a row, beating your old best of ${best}.`,
      url: WORKLOG_URL,
    });
}

/* ---------------------------- levels and badges ---------------------------- */

async function levelWin(userId: string, today: string) {
  const month = today.slice(0, 7);
  const { points, tasks } = await workInRange(
    [userId],
    `${month}-01`,
    `${month}-31`,
  );
  const score = workScore(points, tasks).points;
  if (score <= 0) return;
  const level = getBuffLevelAndTitle(score);
  // The first level is where everyone starts.
  if (level.marker <= 1) return;
  // Only the day the level is reached, not every day after.
  const before = workScore(
    points.filter((p) => p.date < today),
    tasks,
  ).points;
  if (getBuffLevelAndTitle(before).level === level.level) return;
  const next = nextBuffLevel(level.level);
  await announceWin([userId], {
    key: `level:${month}:${level.level}`,
    kind: 'level',
    emoji: '⚡',
    title: `Level up! You're a ${level.title}`,
    body: next
      ? `${score} points this month. ${next.marker - score} more to ${next.title}.`
      : `${score} points this month. That's the top level.`,
    url: WORKLOG_URL,
  });
}

async function badgeWins(userId: string) {
  const user = await db.user.findFirst({
    where: { id: userId },
    select: { id: true, createdAt: true },
  });
  if (!user) return;
  const before = Date.now() - 60_000;
  const list = await awardAndListBadges(user);
  // Badges awarded just now.
  const fresh = list.filter(
    (b) => b.earnedAt && new Date(b.earnedAt).getTime() >= before,
  );
  if (!fresh.length) return;
  const names = fresh.map((b) => b.badge.name).filter(Boolean);
  await announceWin([userId], {
    key: `badge:${fresh
      .map((b) => b.badge.id)
      .sort()
      .join(',')}`,
    kind: 'badge',
    emoji: '🏅',
    title:
      fresh.length === 1
        ? 'New badge earned'
        : `${fresh.length} new badges earned`,
    body: names.length ? names.join(', ') : 'Open your profile to see it.',
    url: WORKLOG_URL,
  });
}

/** After any work point a person logs. */
export function celebrateWork(userId: string) {
  later(async () => {
    const user = await db.user.findFirst({
      where: { id: userId },
      select: { timezone: true },
    });
    const today = localClock(user?.timezone, new Date()).date;
    await streakWins(userId, today);
    await levelWin(userId, today);
    await badgeWins(userId);
  });
}

/* ---------------------------------- goals --------------------------------- */

/** Done tasks and hand-added progress for one goal. */
async function goalRows(project: Pick<Project, 'id'>, goalId: string) {
  const [tasks, tallies]: [DoneTask[], DoneTask[]] = await Promise.all([
    db.task.findMany({
      where: { projectId: project.id, goalId, status: TASK_STATUS.DONE },
      select: {
        status: true,
        goalId: true,
        goalPartId: true,
        forDate: true,
        completedAt: true,
        completedByIds: true,
        assigneeIds: true,
      },
    }),
    tallyRowsFor([project.id]),
  ]);
  return [...tasks, ...tallies.filter((t) => t.goalId === goalId)];
}

/** Who a goal's wins go to: the people it is for, and who did the work. */
const goalPeople = (goal: ProjectGoal, doers: string[]) =>
  Array.from(new Set([...(goal.assigneeIds ?? []), ...doers]));

async function goalWins(project: Project, goal: ProjectGoal, doers: string[]) {
  const rows = await goalRows(project, goal.id);
  const today = toDay();
  const url = `/projects/${project.id}`;
  const people = goalPeople(goal, doers);

  if (isTarget(goal)) {
    const [p] = goalProgress([goal], rows, today);
    const mark = [...TARGET_MARKS].reverse().find((m) => p.percent >= m);
    if (!mark) return;
    await announceWin(people, {
      key: `target:${goal.id}:${goal.target}:${mark}`,
      kind: 'target',
      emoji: mark === 100 ? '🎉' : '🚀',
      title:
        mark === 100
          ? `Reached ${goal.target.toLocaleString('en')} ${goal.title}!`
          : `${mark}% of the way to ${goal.target.toLocaleString('en')} ${goal.title}`,
      body:
        mark === 100
          ? `${project.name} hit its target. Time to set the next one?`
          : `${p.done.toLocaleString('en')} so far on ${project.name}. Keep going.`,
      url,
    });
    return;
  }

  const history = goalHistory(goal, rows, 30, today, goal.since);
  const now = history[history.length - 1];
  if (!now || now.met !== true) return;
  let streak = 0;
  for (let i = history.length - 1; i >= 0 && history[i].met; i--) streak++;
  const noun = PERIOD_NOUN[goal.period];
  await announceWin(people, {
    key: `goal-met:${goal.id}:${now.from}`,
    kind: 'goal-met',
    emoji: streak >= 3 ? '🔥' : '🎯',
    title:
      streak >= 3
        ? `${streak} ${noun}s straight: ${goal.title}`
        : `Goal met: ${goal.title}`,
    body:
      `${now.done}/${now.target} on ${project.name} this ${noun}.` +
      (streak === 2
        ? ` That's 2 ${noun}s in a row.`
        : streak >= 3
          ? ' Unstoppable.'
          : ''),
    url,
  });
}

/** After a task is marked done. */
export function celebrateTaskDone(task: Task) {
  if (task.status !== TASK_STATUS.DONE) return;
  later(async () => {
    const doers = task.completedByIds?.length
      ? task.completedByIds
      : (task.assigneeIds ?? []);
    if (!doers.length) return;
    if (task.size === TASK_SIZE.MAJOR)
      await announceWin(doers, {
        key: `big-task:${task.id}`,
        kind: 'big-task',
        emoji: '💥',
        title: 'Big one done',
        body: task.title,
        url: `/task/${task.id}`,
      });
    if (!task.goalId) return;
    const project: Project | null = await db.project.findFirst({
      where: { id: task.projectId },
    });
    const goal = project?.goals?.find((g) => g.id === task.goalId);
    if (project && goal) await goalWins(project, goal, doers);
  });
}

/** After progress is added to a goal by hand. */
export function celebrateGoal(
  project: Project,
  goal: ProjectGoal,
  userId: string,
) {
  later(() => goalWins(project, goal, [userId]));
}
