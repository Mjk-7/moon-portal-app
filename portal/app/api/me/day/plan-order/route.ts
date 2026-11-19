import { isDay } from '@/lib/daywork/server';
import { savePlanOrder } from '@/lib/worklogs/dayPlan';
import { fail, ok, requireUser } from '@/lib/workspace/server';

export const dynamic = 'force-dynamic';

/**
 * Saves the order of the caller's day in the worklog's Plan mode:
 * `{date, taskIds}`, top to bottom. Read back with the day (`planOrder`).
 */
export async function PUT(request: Request) {
  const { response, user } = await requireUser();
  if (response || !user)
    return response ?? fail(401, 'Authentication required.');
  const body = await request.json().catch(() => ({}));
  if (!isDay(body.date)) return fail(400, 'Use YYYY-MM-DD for the date.');
  if (
    !Array.isArray(body.taskIds) ||
    body.taskIds.some(
      (id: unknown) => typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id),
    )
  )
    return fail(400, 'taskIds must be a list of task ids.');
  const taskIds = await savePlanOrder(user.id, body.date, body.taskIds);
  return ok({ date: body.date, taskIds });
}
