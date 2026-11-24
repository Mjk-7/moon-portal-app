import { createHmac, timingSafeEqual } from 'crypto';

import { postFeedbackBotMessage, updateFeedbackCard } from '@/lib/chat/server';

import { closingPullRequest, feedbackRepo } from './github';
import { claimFix, type FeedbackReportDoc, reportsAwaitingFix } from './store';

/*
 * Telling people their feedback was fixed. A GitHub webhook on the feedback
 * repo calls /api/feedback/github; when a pull request that closes a
 * feedback issue is merged into the default branch (or the issue is closed
 * as done), everyone who reported it, +1s too, hears it from the cat. Each
 * report is told once.
 *
 *   FEEDBACK_GITHUB_WEBHOOK_SECRET  the webhook's secret, to check that a
 *                                   call really came from GitHub
 */

/** Checks GitHub's `X-Hub-Signature-256` header against the raw body. */
export function verifyGitHubSignature(
  rawBody: string,
  header: string | null,
  secret: string,
) {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const given = Buffer.from(header.slice('sha256='.length), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const KEYWORDS = '(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)';
const REPO = '[\\w.-]+/[\\w.-]+';

/**
 * The issues a pull request says it closes, the way GitHub reads them:
 * "Fixes #12", "closes owner/repo#12" or "resolves <issue link>", for this
 * repo only.
 */
export function closedIssueNumbers(text: string, repo = feedbackRepo()) {
  const numbers = new Set<number>();
  const same = (other?: string) =>
    !other || other.toLowerCase() === repo.toLowerCase();
  const patterns = [
    new RegExp(`\\b${KEYWORDS}:?\\s+(${REPO})?#(\\d+)\\b`, 'gi'),
    new RegExp(
      `\\b${KEYWORDS}:?\\s+https://github\\.com/(${REPO})/issues/(\\d+)\\b`,
      'gi',
    ),
  ];
  for (const pattern of patterns)
    for (const [, other, number] of Array.from(text.matchAll(pattern)))
      if (same(other)) numbers.add(Number(number));
  return Array.from(numbers).filter((n) => Number.isSafeInteger(n) && n > 0);
}

type Pr = { number: number; url: string };

async function tellFixed(report: FeedbackReportDoc, pr: Pr | null) {
  const claimed = await claimFix(report._id, pr);
  if (!claimed) return false;
  const issue = report.issueNumber;
  await updateFeedbackCard(
    report.messageId,
    { status: 'fixed' },
    `📝 ${report.title}\n\nFix pushed for #${issue}${report.issueUrl ? `: ${report.issueUrl}` : ''}`,
  ).catch(() => null);
  await postFeedbackBotMessage(report.conversationId, report.userId, {
    text: pr
      ? `Good news! The fix for your feedback “${report.title}” (#${issue}) is pushed 🎉 It went in with pull request #${pr.number}: ${pr.url}\n\nIt reaches the portal and the app with the next update. Thanks for telling us 🐾`
      : `Good news! Your feedback “${report.title}” (#${issue}) is marked done on GitHub 🎉 It reaches the portal and the app with the next update. Thanks for telling us 🐾`,
  });
  return true;
}

async function tellAll(issueNumbers: number[], pr: (n: number) => Pr | null) {
  const reports = await reportsAwaitingFix(issueNumbers);
  const results = await Promise.allSettled(
    reports.map((r) => tellFixed(r, pr(r.issueNumber ?? 0))),
  );
  for (const result of results)
    if (result.status === 'rejected')
      console.error('[feedback] telling a fix failed:', result.reason);
  return results.filter((r) => r.status === 'fulfilled' && r.value).length;
}

/** A pull request was merged into the default branch. */
export async function onPullRequestMerged(pr: {
  number: number;
  html_url: string;
  title?: string | null;
  body?: string | null;
}) {
  const issues = closedIssueNumbers(`${pr.title ?? ''}\n${pr.body ?? ''}`);
  if (!issues.length) return 0;
  return tellAll(issues, () => ({ number: pr.number, url: pr.html_url }));
}

/**
 * An issue was closed as done. When a merged pull request closed it, GitHub
 * sends that event too; waiting a moment lets it go first so the message can
 * name the pull request. Otherwise ask GitHub which one closed it.
 */
export async function onIssueCompleted(number: number) {
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const waiting = await reportsAwaitingFix([number]);
  if (!waiting.length) return 0;
  const pr = await closingPullRequest(number);
  return tellAll([number], () => pr);
}
