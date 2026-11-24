import { chatRoute, readJson } from '@/lib/chat/api';
import { requireFeedbackAdmin } from '@/lib/feedback/admin';
import { feedbackEnabled, setFeedbackEnabled } from '@/lib/feedback/store';

export const dynamic = 'force-dynamic';

/** Switch the Feedback Cat on or off: `{ enabled }`. Portal admins only. */
export async function PATCH(request: Request) {
  const body = await readJson(request);
  return chatRoute(async (user) => {
    requireFeedbackAdmin(user);
    if (typeof body.enabled === 'boolean')
      await setFeedbackEnabled(body.enabled, user.id);
    return { enabled: await feedbackEnabled() };
  });
}
