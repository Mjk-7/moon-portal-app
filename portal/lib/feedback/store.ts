import { ObjectId } from 'mongodb';

import { getMongoDb } from '@/lib/db/mongoose';
import type { FeedbackPriority, FeedbackType } from '@/models/chat';

/*
 * What the feedback cat keeps in MongoDB:
 *   FeedbackReport    one per draft the cat wrote: who sent it (only ever
 *                     shown in the portal, never on GitHub), the public
 *                     issue text, and what became of it.
 *   FeedbackUsage     replies and reports per person per day, for limits.
 *   FeedbackSettings  one document: whether the cat is on.
 */

export type FeedbackReportStatus =
  | 'draft'
  | 'filing'
  | 'filed'
  | 'merged'
  | 'saved'
  | 'discarded'
  | 'failed';

export interface FeedbackReportDoc {
  _id: ObjectId;
  userId: string;
  conversationId: string;
  /** The cat's message that shows the draft card. */
  messageId: string;
  status: FeedbackReportStatus;
  kind: FeedbackType;
  area: string | null;
  priority: FeedbackPriority;
  title: string;
  summary: string;
  /** Points Claude pulled out of the talk, already scrubbed. */
  details: string[];
  context: {
    platform?: string | null;
    appVersion?: string | null;
    page?: string | null;
    screen?: string | null;
  };
  /** A random code for the person, the only "who" on GitHub. */
  reporterCode: string;
  issueNumber?: number | null;
  issueUrl?: string | null;
  /** Set when the cat added it to an open issue instead. */
  mergedInto?: number | null;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
  filedAt?: Date | null;
}

interface UsageDoc {
  _id: string;
  userId: string;
  day: string;
  replies: number;
  reports: number;
}

interface SettingsDoc {
  _id: 'settings';
  enabled: boolean;
  updatedAt?: Date;
  updatedById?: string | null;
}

let ready: Promise<void> | null = null;

export async function feedbackCollections() {
  const mongo = await getMongoDb();
  const reports = mongo.collection<FeedbackReportDoc>('FeedbackReport');
  const usage = mongo.collection<UsageDoc>('FeedbackUsage');
  const settings = mongo.collection<SettingsDoc>('FeedbackSettings');
  ready ??= Promise.all([
    reports.createIndex({ messageId: 1 }, { unique: true }),
    reports.createIndex({ createdAt: -1 }),
    reports.createIndex({ userId: 1, createdAt: -1 }),
  ])
    .then(() => undefined)
    .catch((error) => {
      ready = null;
      console.error('[feedback] creating indexes failed:', error);
    });
  await ready;
  return { reports, usage, settings };
}

/* -------------------------------- settings ------------------------------- */

export async function feedbackEnabled() {
  const { settings } = await feedbackCollections();
  const doc = await settings.findOne({ _id: 'settings' });
  return doc?.enabled ?? true;
}

export async function setFeedbackEnabled(enabled: boolean, byId: string) {
  const { settings } = await feedbackCollections();
  await settings.updateOne(
    { _id: 'settings' },
    { $set: { enabled, updatedAt: new Date(), updatedById: byId } },
    { upsert: true },
  );
}

/* --------------------------------- limits -------------------------------- */

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Counts one more reply or report for the person today and says whether it
 * is still within `limit` (and the count, so a limit note is sent once).
 */
export async function spendAllowance(
  userId: string,
  what: 'replies' | 'reports',
  limit: number,
) {
  const { usage } = await feedbackCollections();
  const day = today();
  const doc = await usage.findOneAndUpdate(
    { _id: `${userId}:${day}` },
    {
      $setOnInsert: {
        userId,
        day,
        ...(what === 'replies' ? { reports: 0 } : { replies: 0 }),
      },
      $inc: { [what]: 1 },
    },
    { upsert: true, returnDocument: 'after' },
  );
  const count = doc?.[what] ?? 1;
  return { ok: count <= limit, count };
}

/* --------------------------------- reports ------------------------------- */

/** A short code that stays the same for one person, so +1s can be told apart. */
export const reporterCodeOf = (userId: string) => {
  let hash = 0;
  const salt = process.env.FEEDBACK_REPORTER_SALT || 'tmd-feedback';
  for (const ch of `${salt}:${userId}`)
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `R-${hash.toString(36).toUpperCase().padStart(6, '0').slice(-6)}`;
};

export async function saveDraftReport(
  report: Omit<FeedbackReportDoc, '_id' | 'createdAt' | 'updatedAt'>,
) {
  const { reports } = await feedbackCollections();
  const now = new Date();
  const doc: FeedbackReportDoc = {
    ...report,
    _id: new ObjectId(),
    createdAt: now,
    updatedAt: now,
  };
  await reports.insertOne(doc);
  return doc;
}

export async function reportForMessage(messageId: string) {
  const { reports } = await feedbackCollections();
  return reports.findOne({ messageId });
}

export async function updateReport(
  id: ObjectId,
  set: Partial<FeedbackReportDoc>,
  /** Only when the report is in one of these states (to claim it once). */
  onlyIf?: FeedbackReportStatus[],
) {
  const { reports } = await feedbackCollections();
  return reports.findOneAndUpdate(
    { _id: id, ...(onlyIf && { status: { $in: onlyIf } }) },
    { $set: { ...set, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
}

/** For the admin inbox, newest first. */
export async function listReports({
  status,
  limit = 100,
}: { status?: FeedbackReportStatus | 'all'; limit?: number } = {}) {
  const { reports } = await feedbackCollections();
  return reports
    .find(
      status && status !== 'all'
        ? { status }
        : { status: { $ne: 'draft' as FeedbackReportStatus } },
    )
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 300))
    .toArray();
}

export async function reportById(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const { reports } = await feedbackCollections();
  return reports.findOne({ _id: new ObjectId(id) });
}
