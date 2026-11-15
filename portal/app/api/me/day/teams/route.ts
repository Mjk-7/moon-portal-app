import { dayRange, isDay, todayOf } from '@/lib/daywork/server';
import { db } from '@/lib/mongodb/db-client';
import {
  fail,
  getPublicUsers,
  ok,
  requireProjectPermission,
  requireUser,
} from '@/lib/workspace/server';
import type { Project, Task } from '@/models/workspace';
import { OPEN_TASK_STATUSES, TASK_STATUS } from '@/models/workspace';

export const dynamic = 'force-dynamic';

/** At most this many projects are read in one call. */
const MAX_PROJECTS = 24;
/** How far ahead "+X more" looks for upcoming tasks. */
const UPCOMING_DAYS = 14;

/**
 * Who is working on what in the projects of the caller's day:
 * `?date=YYYY-MM-DD&projects=a,b`. A project's work on a day is its tasks
 * planned for that day, finished on it, under way, and (on today) still
 * pending from before. Personal projects are left out.
 */
export async function GET(request: Request) {
  const { response, user } = await requireUser();
  if (response || !user)
    return response ?? fail(401, 'Authentication required.');
  const params = new URL(request.url).searchParams;
  const date = params.get('date');
  if (!isDay(date)) return fail(400, 'Use YYYY-MM-DD for the date.');
  const asked = Array.from(
    new Set((params.get('projects') ?? '').split(',').filter(Boolean)),
  ).slice(0, MAX_PROJECTS);
  if (!asked.length) return ok({ projects: {} });

  const projects: Project[] = await db.project.findMany({
    where: { id: { in: asked } },
  });
  const readable: Project[] = [];
  for (const project of projects) {
    if (project.isPersonal) continue;
    const { response: denied } = await requireProjectPermission(
      project.id,
      'tasks:read',
    );
    if (!denied) readable.push(project);
  }
  if (!readable.length) return ok({ projects: {} });

  const me = await db.user.findFirst({
    where: { id: user.id },
    select: { timezone: true },
  });
  const range = dayRange(me?.timezone ?? null, date);
  const today = await todayOf(user.id);
  const ors: Record<string, unknown>[] = [
    { forDate: date, status: { not: TASK_STATUS.ARCHIVED } },
    { completedAt: { gte: range.start, lte: range.end } },
    { status: TASK_STATUS.IN_PROGRESS },
  ];
  if (date === today)
    ors.push({ forDate: { lt: date }, status: { in: OPEN_TASK_STATUSES } });
  // What comes next, behind "+X more": open tasks of the next two weeks.
  const until = new Date(`${date}T00:00:00Z`);
  until.setUTCDate(until.getUTCDate() + UPCOMING_DAYS);
  ors.push({
    forDate: { gt: date, lte: until.toISOString().slice(0, 10) },
    status: { in: OPEN_TASK_STATUSES },
  });
  const tasks: Task[] = await db.task.findMany({
    where: {
      AND: [
        { projectId: { in: readable.map((p) => p.id) } },
        { status: { notIn: [TASK_STATUS.ARCHIVED, TASK_STATUS.IGNORED] } },
        { OR: ors },
      ],
    },
    select: {
      id: true,
      title: true,
      status: true,
      flag: true,
      forDate: true,
      projectId: true,
      assigneeIds: true,
      ownerId: true,
      createdById: true,
      completedAt: true,
    },
    orderBy: { createdAt: 'asc' },
    take: 600,
  });

  // Whose a task is: its assignees, else whoever wrote it on their day.
  const workersOf = (t: Task) =>
    t.assigneeIds?.length
      ? t.assigneeIds
      : [t.ownerId ?? t.createdById].filter((id): id is string => !!id);
  const users = await getPublicUsers(tasks.flatMap(workersOf));
  type Person = {
    id: string;
    name: string;
    avatar: string | null;
    tasks: (Pick<Task, 'id' | 'title' | 'status' | 'flag' | 'forDate'> & {
      upcoming?: boolean;
    })[];
  };
  // A task is the day's unless it is for a later day and not finished on it.
  const isUpcoming = (t: Task) =>
    !!t.forDate &&
    t.forDate > date &&
    !(
      t.completedAt &&
      new Date(t.completedAt as unknown as string) >= new Date(range.start) &&
      new Date(t.completedAt as unknown as string) <= new Date(range.end)
    );
  const out: Record<string, { mine: number; total: number; people: Person[] }> =
    {};
  for (const project of readable) {
    const list = tasks.filter((t) => t.projectId === project.id);
    const people = new Map<string, Person>();
    for (const t of list) {
      for (const id of workersOf(t)) {
        const u = users.find((x: { id: string }) => x.id === id);
        const person: Person = people.get(id) ?? {
          id,
          name: u?.name || u?.username || 'Someone',
          avatar: u?.avatar ?? null,
          tasks: [],
        };
        person.tasks.push({
          id: t.id,
          title: t.title,
          status: t.status,
          flag: t.flag ?? null,
          forDate: t.forDate ?? null,
          ...(isUpcoming(t) ? { upcoming: true } : {}),
        });
        people.set(id, person);
      }
    }
    const onDay = list.filter((t) => !isUpcoming(t));
    out[project.id] = {
      mine: onDay.filter((t) => workersOf(t).includes(user.id)).length,
      total: onDay.length,
      // The caller first, then whoever has the most on.
      people: Array.from(people.values()).sort(
        (a, b) =>
          Number(b.id === user.id) - Number(a.id === user.id) ||
          b.tasks.filter((t) => !t.upcoming).length -
            a.tasks.filter((t) => !t.upcoming).length,
      ),
    };
  }
  return ok({ projects: out });
}
