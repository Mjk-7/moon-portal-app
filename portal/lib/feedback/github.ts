/*
 * Filing feedback on GitHub. Server only: the token is read from
 * FEEDBACK_GITHUB_TOKEN (a fine-grained token with only "Issues: read and
 * write" on the one repo) and never reaches a browser or the app.
 * FEEDBACK_GITHUB_REPO picks the repo, owner/name.
 */

const API = 'https://api.github.com';

export const feedbackRepo = () =>
  process.env.FEEDBACK_GITHUB_REPO || 'TheMoonDevs/moon-portal-app';

export const githubReady = () => !!process.env.FEEDBACK_GITHUB_TOKEN;

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function github<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}/repos/${feedbackRepo()}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.FEEDBACK_GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'portal-feedback-cat',
      ...(init.body && { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new GitHubError(
      response.status,
      `GitHub ${response.status}: ${text.slice(0, 300)}`,
    );
  }
  return (await response.json()) as T;
}

/** Labels the cat uses, with their colours. */
export const LABELS: Record<string, { color: string; description: string }> = {
  feedback: {
    color: 'f2a33a',
    description: 'Sent by the Feedback Cat in Messages',
  },
  bug: { color: 'd73a4a', description: 'Something works the wrong way' },
  error: { color: 'b60205', description: 'A crash or an error message' },
  'feature request': { color: '1d76db', description: 'Something new to add' },
  improvement: {
    color: '0e8a16',
    description: 'Make something that exists better',
  },
  design: { color: 'c5def5', description: 'Looks, layout or wording' },
  performance: { color: 'fbca04', description: 'Slow or heavy' },
  P1: { color: 'b60205', description: 'Blocks work or loses data' },
  P2: { color: 'd93f0b', description: 'Gets in the way' },
  P3: { color: 'fef2c0', description: 'Nice to fix' },
};

export const areaLabel = (area: string) => `area: ${area}`;

const known = new Set<string>();

/** Makes any missing labels; ones that exist already are left alone. */
async function ensureLabels(names: string[]) {
  await Promise.all(
    names
      .filter((name) => !known.has(name))
      .map(async (name) => {
        const look = LABELS[name] ?? {
          color: 'ededed',
          description: 'Part of the portal',
        };
        try {
          await github('/labels', {
            method: 'POST',
            body: JSON.stringify({ name, ...look }),
          });
        } catch (error) {
          // 422: it exists.
          if (!(error instanceof GitHubError && error.status === 422))
            throw error;
        }
        known.add(name);
      }),
  );
}

export interface OpenIssue {
  number: number;
  title: string;
  html_url: string;
  labels: { name: string }[];
  pull_request?: unknown;
}

/** Open issues the cat filed before, newest first. */
export async function openFeedbackIssues(limit = 50) {
  const issues = await github<OpenIssue[]>(
    `/issues?labels=feedback&state=open&per_page=${Math.min(limit, 100)}&sort=created&direction=desc`,
  );
  return issues.filter((i) => !i.pull_request);
}

export async function createIssue(input: {
  title: string;
  body: string;
  labels: string[];
}) {
  await ensureLabels(input.labels);
  return github<{ number: number; html_url: string }>('/issues', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function commentOnIssue(number: number, body: string) {
  return github<{ html_url: string }>(`/issues/${number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export const issueUrl = (number: number) =>
  `https://github.com/${feedbackRepo()}/issues/${number}`;

type ClosedBy = {
  data?: {
    repository?: {
      issue?: {
        timelineItems?: {
          nodes?: {
            closer?: { number?: number; url?: string; merged?: boolean } | null;
          }[];
        };
      } | null;
    } | null;
  };
};

/**
 * The merged pull request that closed an issue, if GitHub will say. A token
 * with only Issues access may not see pull requests; then this is null.
 */
export async function closingPullRequest(number: number) {
  if (!githubReady()) return null;
  const [owner, name] = feedbackRepo().split('/');
  try {
    const response = await fetch(`${API}/graphql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.FEEDBACK_GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'portal-feedback-cat',
      },
      body: JSON.stringify({
        query: `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issue(number:$number){timelineItems(itemTypes:[CLOSED_EVENT],last:1){nodes{...on ClosedEvent{closer{...on PullRequest{number url merged}}}}}}}}`,
        variables: { owner, name, number },
      }),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const json = (await response.json()) as ClosedBy;
    const closer =
      json.data?.repository?.issue?.timelineItems?.nodes?.at(-1)?.closer;
    return closer?.number && closer.url && closer.merged
      ? { number: closer.number, url: closer.url }
      : null;
  } catch {
    return null;
  }
}
