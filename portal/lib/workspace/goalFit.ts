import { askClaudeForJson, claudeReady, nullableString } from '@/lib/ai/claude';
import { db } from '@/lib/mongodb/db-client';
import type { Project, ProjectGoal, Task } from '@/models/workspace';
import { TASK_STATUS } from '@/models/workspace';

import { attachToRun } from './goalRuns';

/*
 * Goals pick up the work that fills them. When a task with no goal is done,
 * the goal (or part of one) it delivers towards is found for it: by Claude,
 * which reads what the goal is for, or by the words of the goal when Claude
 * is not set up. Each task is looked at once, and a goal someone set or
 * cleared by hand is never changed.
 */

type Fit = { goalId: string; goalPartId: string | null };

const STOP = new Set([
  'and',
  'the',
  'for',
  'with',
  'from',
  'each',
  'every',
  'per',
  'new',
  'more',
  'our',
  'your',
  'day',
  'week',
  'month',
  'daily',
  'weekly',
  'monthly',
]);

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !/^\d/.test(w) && !STOP.has(w));

/** "post" matches "posted", "short" matches "shorts". */
const sameWord = (a: string, b: string) =>
  a === b ||
  (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));

const hits = (want: string[], have: string[]) =>
  want.filter((w) => have.some((h) => sameWord(w, h))).length;

/**
 * The goal a task's title is about, by words: at least half of the goal's
 * words, and for a goal with parts, the part's name too. Null when no goal
 * or more than one fits.
 */
export function goalByWords(title: string, goals: ProjectGoal[]): Fit | null {
  const have = words(title);
  const fits: (Fit & { score: number })[] = [];
  for (const goal of goals) {
    const want = words(goal.title);
    const score = want.length ? hits(want, have) / want.length : 0;
    if (goal.parts?.length) {
      const parts = goal.parts.filter((p) => hits(words(p.label), have) > 0);
      // The part named, and the goal's words or nothing else to go on.
      if (parts.length === 1 && (score >= 0.5 || !want.length))
        fits.push({ goalId: goal.id, goalPartId: parts[0].id, score: 1 });
    } else if (score >= 0.5) {
      fits.push({ goalId: goal.id, goalPartId: null, score });
    }
  }
  fits.sort((a, b) => b.score - a.score);
  if (!fits.length || (fits.length > 1 && fits[0].score === fits[1].score))
    return null;
  return { goalId: fits[0].goalId, goalPartId: fits[0].goalPartId };
}

const FITS_SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          task: { type: 'integer' },
          goalId: nullableString,
          partId: nullableString,
          confidence: { type: 'number' },
        },
        required: ['task', 'goalId', 'partId', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['rows'],
  additionalProperties: false,
};

/** Asks Claude which goal each task delivers towards; null if it cannot. */
async function goalsByClaude(
  tasks: Task[],
  goals: ProjectGoal[],
): Promise<Map<string, Fit | null> | null> {
  if (!claudeReady()) return null;
  const prompt = `A project has goals: targets that repeat every day, week or month, and one-off totals to reach. Each finished task that directly delivers one unit of a goal counts towards it (one released video for "Release 3 lyric videos a week"). Tasks that only help along the way (a thumbnail, a meeting, a fix) count towards no goal.

Goals (id, title, target, parts as id: label):
${goals
  .map(
    (g) =>
      `- ${g.id} | ${g.title} | ${g.target} ${g.kind === 'target' ? 'in total' : `a ${g.period}`}${
        g.parts?.length
          ? ` | parts: ${g.parts.map((p) => `${p.id}: ${p.label}`).join('; ')}`
          : ''
      }`,
  )
  .join('\n')}

Finished tasks:
${tasks.map((t, i) => `${i}. ${t.title}`).join('\n')}

For every task return the goal id it counts towards (and the part id when the goal has parts), or nulls, with your confidence from 0 to 1.`;
  try {
    const answer = await askClaudeForJson<{
      rows: {
        task: number;
        goalId: string | null;
        partId: string | null;
        confidence: number;
      }[];
    }>({ prompt, schema: FITS_SCHEMA });
    if (!answer) return null;
    const rows = answer.rows;
    const out = new Map<string, Fit | null>(tasks.map((t) => [t.id, null]));
    for (const row of Array.isArray(rows) ? rows : []) {
      const task = tasks[row.task];
      const goal = goals.find((g) => g.id === row.goalId);
      if (!task || !goal || !(row.confidence >= 0.7)) continue;
      const part = goal.parts?.find((p) => p.id === row.partId);
      if (goal.parts?.length && !part) continue;
      out.set(task.id, { goalId: goal.id, goalPartId: part?.id ?? null });
    }
    return out;
  } catch (err) {
    console.error('Goal matching with Claude failed', err);
    return null;
  }
}

/** Most tasks looked at in one go. */
const MAX_TASKS = 40;

/**
 * Finds the goal of each done task that has none and was not looked at yet
 * (done on or after `since`, when given), and saves it. Returns the tasks as
 * they are now, in the same order.
 */
export async function fitGoals(tasks: Task[], since?: string): Promise<Task[]> {
  const open = tasks
    .filter(
      (t) =>
        t.status === TASK_STATUS.DONE &&
        !t.goalId &&
        !t.goalChecked &&
        (!since ||
          (!!t.completedAt &&
            new Date(t.completedAt as string).toISOString().slice(0, 10) >=
              since)),
    )
    .slice(-MAX_TASKS);
  if (!open.length) return attachRuns(tasks);
  const projectIds = Array.from(new Set(open.map((t) => t.projectId)));
  const projects: Project[] = await db.project.findMany({
    where: { id: { in: projectIds } },
  });
  const updated = new Map<string, Task>();
  for (const project of projects) {
    const goals = project.goals ?? [];
    // No goals yet: looked at again once there are some.
    if (!goals.length) continue;
    const mine = open.filter((t) => t.projectId === project.id);
    const byClaude = await goalsByClaude(mine, goals);
    for (const task of mine) {
      const fit = byClaude
        ? (byClaude.get(task.id) ?? null)
        : goalByWords(task.title, goals);
      updated.set(
        task.id,
        await db.task.update({
          where: { id: task.id },
          data: {
            goalId: fit?.goalId ?? null,
            goalPartId: fit?.goalPartId ?? null,
            goalChecked: true,
          },
        }),
      );
    }
  }
  return attachRuns(tasks.map((t) => updated.get(t.id) ?? t));
}

/** Only tasks changed this recently take a goal's run on their own. */
const RECENT_MS = 36 * 3600 * 1000;

/**
 * Tasks linked to a scheduled goal that are not on one of its runs yet take
 * the run they stand for (lib/workspace/goalRuns), so the goal does not
 * also make a task of its own for it. Only recently changed ones: older
 * ones are left as they are.
 */
async function attachRuns(tasks: Task[]): Promise<Task[]> {
  const recent = (t: Task) =>
    Date.now() - new Date((t.updatedAt ?? t.createdAt) as string).getTime() <
    RECENT_MS;
  const loose = tasks.filter(
    (t) =>
      t.goalId &&
      t.projectId &&
      !t.scheduleId &&
      t.status !== TASK_STATUS.ARCHIVED &&
      t.status !== TASK_STATUS.IGNORED &&
      recent(t),
  );
  if (!loose.length) return tasks;
  const projects: Project[] = await db.project.findMany({
    where: { id: { in: Array.from(new Set(loose.map((t) => t.projectId))) } },
  });
  const scheduled = (t: Task) => {
    const goal = projects
      .find((p) => p.id === t.projectId)
      ?.goals?.find((g) => g.id === t.goalId);
    return !!goal && goal.kind !== 'target' && goal.makeTasks !== false;
  };
  const updated = new Map<string, Task>();
  for (const task of loose.filter(scheduled))
    updated.set(task.id, await attachToRun(task, { ahead: true }));
  return tasks.map((t) => updated.get(t.id) ?? t);
}

/** `fitGoals` for one task. */
export const fitGoal = async (task: Task) => (await fitGoals([task]))[0];
