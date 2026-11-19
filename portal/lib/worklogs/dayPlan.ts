import { db } from '@/lib/mongodb/db-client';
import type { DayPlan } from '@/models/workspace';

/*
 * The order a person put a day's tasks in, in the worklog's Plan mode. One
 * record per person and day; tasks that left the day are skipped when read.
 */

/** The saved order of a day's tasks, top to bottom (empty when never set). */
export async function readPlanOrder(userId: string, date: string) {
  const plan: DayPlan | null = await db.dayPlan.findFirst({
    where: { userId, date },
  });
  return Array.isArray(plan?.taskIds) ? (plan!.taskIds as string[]) : [];
}

/** Saves a day's order, replacing the one before. */
export async function savePlanOrder(
  userId: string,
  date: string,
  taskIds: string[],
) {
  const now = new Date().toISOString();
  const ids = Array.from(new Set(taskIds)).slice(0, 500);
  await db.dayPlan.upsert({
    where: { userId, date },
    create: { userId, date, taskIds: ids, createdAt: now, updatedAt: now },
    update: { taskIds: ids, updatedAt: now },
  });
  return ids;
}
