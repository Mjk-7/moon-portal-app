import type { NextRequest } from 'next/server';

import { isDay, todayOf } from '@/lib/daywork/server';
import { db } from '@/lib/mongodb/db-client';
import { hasPermission } from '@/lib/permissions/matching';
import { addDays, mondayOf } from '@/lib/workspace/projects';
import {
  fail,
  getWorkspaceForUser,
  ok,
  requireUser,
} from '@/lib/workspace/server';
import type { Project, Task } from '@/models/workspace';
import { PROJECT_STATUS, TASK_STATUS } from '@/models/workspace';

export const dynamic = 'force-dynamic';

const GONE = [TASK_STATUS.ARCHIVED, TASK_STATUS.IGNORED];

/**
 * Every project the caller can read, lean (names, colours, logos, who is
 * on it), with this week's tasks counted: how many are still open of the
 * ones planned or due Monday to Sunday. One call for the app's Home, so
 * each company opens at once. `?today=` is the phone's day, which picks the
 * week; the person's own today by default.
 */
export async function GET(request: NextRequest) {
  const { response, user } = await requireUser();
  if (response || !user)
    return response ?? fail(401, 'Authentication required.');

  const asked = request.nextUrl.searchParams.get('today');
  const today = isDay(asked) ? asked : await todayOf(user.id);
  const from = mondayOf(today);
  const to = addDays(from, 6);

  const workspace = await getWorkspaceForUser(user);
  const companyIds = workspace
    .filter((w) => hasPermission(w.permissions, 'projects:read'))
    .map((w) => w.company.id);
  if (!companyIds.length) return ok({ from, to, projects: [] });

  const projects: Project[] = await db.project.findMany({
    where: {
      companyId: { in: companyIds },
      status: { notIn: [PROJECT_STATUS.ARCHIVED] },
    },
    select: {
      id: true,
      companyId: true,
      name: true,
      color: true,
      logo: true,
      parentId: true,
      isCore: true,
      status: true,
      leadIds: true,
      memberIds: true,
    },
    orderBy: { name: 'asc' },
  });
  if (!projects.length) return ok({ from, to, projects: [] });

  // Due dates are kept as ISO times; the day is enough here.
  const tasks = (await db.task.findMany({
    where: {
      projectId: { in: projects.map((p) => p.id) },
      status: { notIn: GONE },
      OR: [
        { forDate: { gte: from, lte: to } },
        { dueDate: { gte: from, lte: `${to}T23:59:59.999Z` } },
      ],
    },
    select: { projectId: true, status: true },
  })) as Pick<Task, 'projectId' | 'status'>[];

  const week = new Map<string, { open: number; total: number }>();
  for (const t of tasks) {
    if (!t.projectId) continue;
    const row = week.get(t.projectId) ?? { open: 0, total: 0 };
    row.total += 1;
    if (t.status !== TASK_STATUS.DONE) row.open += 1;
    week.set(t.projectId, row);
  }

  return ok({
    from,
    to,
    projects: projects.map((p) => ({
      ...p,
      week: week.get(p.id) ?? { open: 0, total: 0 },
    })),
  });
}
