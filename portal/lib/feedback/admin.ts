import { ChatError } from '@/lib/chat/server';
import { db } from '@/lib/mongodb/db-client';
import type { SessionUser } from '@/lib/permissions/server';

import { feedbackRepo, githubReady } from './github';
import {
  feedbackEnabled,
  type FeedbackReportDoc,
  type FeedbackReportStatus,
  listReports,
} from './store';

export const requireFeedbackAdmin = (user: SessionUser) => {
  if (!user.isAdmin && !user.isSuperAdmin)
    throw new ChatError(403, 'Only portal admins can see feedback.');
};

/** A report as the admin inbox shows it: here (not on GitHub) with who sent it. */
export interface FeedbackInboxItem {
  id: string;
  status: FeedbackReportStatus;
  kind: string;
  area: string | null;
  priority: string;
  title: string;
  summary: string;
  details: string[];
  platform: string | null;
  appVersion: string | null;
  page: string | null;
  reporterCode: string;
  sender: { id: string; name: string | null; avatar: string | null };
  issueNumber: number | null;
  issueUrl: string | null;
  mergedInto: number | null;
  error: string | null;
  createdAt: string;
  filedAt: string | null;
  /** When the person was told it's fixed, and by which pull request. */
  fixedAt: string | null;
  fixPrNumber: number | null;
  fixPrUrl: string | null;
}

export async function inboxItems(docs: FeedbackReportDoc[]) {
  const ids = Array.from(new Set(docs.map((d) => d.userId)));
  const users: { id: string; name: string | null; avatar: string | null }[] =
    ids.length
      ? await db.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, avatar: true },
        })
      : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return docs.map(
    (d): FeedbackInboxItem => ({
      id: d._id.toHexString(),
      status: d.status,
      kind: d.kind,
      area: d.area,
      priority: d.priority,
      title: d.title,
      summary: d.summary,
      details: d.details,
      platform: d.context.platform ?? null,
      appVersion: d.context.appVersion ?? null,
      page: d.context.page ?? null,
      reporterCode: d.reporterCode,
      sender: byId.get(d.userId) ?? {
        id: d.userId,
        name: 'Someone',
        avatar: null,
      },
      issueNumber: d.issueNumber ?? null,
      issueUrl: d.issueUrl ?? null,
      mergedInto: d.mergedInto ?? null,
      error: d.error ?? null,
      createdAt: d.createdAt.toISOString(),
      filedAt: d.filedAt ? d.filedAt.toISOString() : null,
      fixedAt: d.fixedAt ? d.fixedAt.toISOString() : null,
      fixPrNumber: d.fixPrNumber ?? null,
      fixPrUrl: d.fixPrUrl ?? null,
    }),
  );
}

export async function feedbackInbox(status?: FeedbackReportStatus | 'all') {
  const [docs, enabled] = await Promise.all([
    listReports({ status }),
    feedbackEnabled(),
  ]);
  return {
    reports: await inboxItems(docs),
    settings: {
      enabled,
      githubConnected: githubReady(),
      repo: feedbackRepo(),
    },
  };
}
