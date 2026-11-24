import { chatRoute, readJson } from '@/lib/chat/api';
import {
  ensureFeedbackConversation,
  getConversation,
  setFeedbackContext,
} from '@/lib/chat/server';

export const dynamic = 'force-dynamic';

const short = (value: unknown, max = 120) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

const PLATFORMS = ['web', 'ios', 'android'];

/**
 * Opens the person's chat with the Feedback Cat, and notes where they came
 * from for the issue: `{ platform, appVersion, page, screen }`. No names or
 * account details are kept here.
 */
export async function POST(request: Request) {
  const body = await readJson(request);
  return chatRoute(async (user) => {
    const room = await ensureFeedbackConversation(user.id);
    const conversationId = room._id.toHexString();
    const platform = short(body.platform, 20)?.toLowerCase() ?? null;
    await setFeedbackContext(user.id, conversationId, {
      platform: platform && PLATFORMS.includes(platform) ? platform : null,
      appVersion: short(body.appVersion, 20),
      page: short(body.page),
      screen: short(body.screen, 40),
    });
    return { conversation: await getConversation(user.id, conversationId) };
  });
}
