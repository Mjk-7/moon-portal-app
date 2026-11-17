import { upcomingMeetings } from '@/lib/meet/upcoming';
import { fail, ok, requireUser } from '@/lib/workspace/server';

export const dynamic = 'force-dynamic';

/**
 * The caller's confirmed meetings for the coming week, for the meeting
 * reminders on their phone and in their browser.
 */
export async function GET() {
  const { response, user } = await requireUser();
  if (response || !user)
    return response ?? fail(401, 'Authentication required.');
  return ok({ meetings: await upcomingMeetings(user.id) });
}
