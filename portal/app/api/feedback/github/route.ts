import { waitUntil } from '@vercel/functions';
import { NextResponse } from 'next/server';

import {
  onIssueCompleted,
  onPullRequestMerged,
  verifyGitHubSignature,
} from '@/lib/feedback/fixed';
import { feedbackRepo } from '@/lib/feedback/github';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Payload = {
  action?: string;
  repository?: { full_name?: string; default_branch?: string };
  pull_request?: {
    number: number;
    html_url: string;
    title?: string | null;
    body?: string | null;
    merged?: boolean;
    base?: { ref?: string };
  };
  issue?: {
    number: number;
    state_reason?: string | null;
    pull_request?: unknown;
  };
};

const log = (error: unknown) =>
  console.error('[feedback] GitHub webhook failed:', error);

/**
 * GitHub's webhook for the feedback repo (Issues and Pull requests events).
 * Signed with FEEDBACK_GITHUB_WEBHOOK_SECRET; anything unsigned is refused.
 * The work happens after GitHub gets its answer.
 */
export async function POST(request: Request) {
  const secret = process.env.FEEDBACK_GITHUB_WEBHOOK_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: 'The feedback webhook is not set up.' },
      { status: 503 },
    );

  const raw = await request.text();
  if (
    !verifyGitHubSignature(
      raw,
      request.headers.get('x-hub-signature-256'),
      secret,
    )
  )
    return NextResponse.json({ error: 'Bad signature' }, { status: 401 });

  let payload: Payload;
  try {
    const form = request.headers
      .get('content-type')
      ?.includes('application/x-www-form-urlencoded');
    payload = JSON.parse(
      form ? (new URLSearchParams(raw).get('payload') ?? '') : raw,
    );
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 });
  }

  const event = request.headers.get('x-github-event');
  if (event === 'ping') return NextResponse.json({ ok: true });
  if (
    payload.repository?.full_name?.toLowerCase() !==
    feedbackRepo().toLowerCase()
  )
    return NextResponse.json({ ok: true, ignored: 'another repo' });

  const pr = payload.pull_request;
  if (
    event === 'pull_request' &&
    payload.action === 'closed' &&
    pr?.merged &&
    pr.base?.ref === payload.repository?.default_branch
  ) {
    waitUntil(onPullRequestMerged(pr).catch(log));
    return NextResponse.json({ ok: true });
  }

  const issue = payload.issue;
  if (
    event === 'issues' &&
    payload.action === 'closed' &&
    issue?.state_reason === 'completed' &&
    !issue.pull_request
  ) {
    waitUntil(onIssueCompleted(issue.number).catch(log));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: event });
}
