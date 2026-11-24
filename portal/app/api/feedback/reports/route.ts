import type { NextRequest } from 'next/server';

import { chatRoute } from '@/lib/chat/api';
import { feedbackInbox, requireFeedbackAdmin } from '@/lib/feedback/admin';
import type { FeedbackReportStatus } from '@/lib/feedback/store';

export const dynamic = 'force-dynamic';

const STATUSES = ['all', 'filed', 'merged', 'saved', 'failed', 'discarded'];

/** The Feedback Cat's reports, for portal admins: `?status=`. */
export async function GET(request: NextRequest) {
  const asked = request.nextUrl.searchParams.get('status') ?? 'all';
  const status = (STATUSES.includes(asked) ? asked : 'all') as
    | FeedbackReportStatus
    | 'all';
  return chatRoute(async (user) => {
    requireFeedbackAdmin(user);
    return feedbackInbox(status);
  });
}
