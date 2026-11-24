import { chatRoute } from '@/lib/chat/api';
import { ChatError } from '@/lib/chat/server';
import { inboxItems, requireFeedbackAdmin } from '@/lib/feedback/admin';
import { fileReport } from '@/lib/feedback/file';
import { githubReady } from '@/lib/feedback/github';
import { reportById } from '@/lib/feedback/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Params = { params: { id: string } };

/** "File to GitHub" for a report that was saved in the portal. */
export async function POST(_request: Request, { params }: Params) {
  return chatRoute(async (user) => {
    requireFeedbackAdmin(user);
    if (!githubReady())
      throw new ChatError(
        400,
        'GitHub isn’t connected yet. Set FEEDBACK_GITHUB_TOKEN on the server first.',
      );
    const report = await reportById(params.id);
    if (!report) throw new ChatError(404, 'Report not found.');
    if (report.status !== 'saved' && report.status !== 'failed')
      throw new ChatError(409, 'That report was already filed.');
    const done = await fileReport(report, { by: 'admin' });
    if (!done) throw new ChatError(409, 'Someone is filing it already.');
    return { report: (await inboxItems([done]))[0] };
  });
}
