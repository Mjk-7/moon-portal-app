/*
 * Who shows up in lists of people (chat contacts, team and assignee
 * pickers, member lists, leaderboards, the World). Inactive people never
 * do. Test accounts (an admin marked them, a seed script made them, or
 * the App Store review account and its demo teammates) only show for
 * people who turned on "Show test accounts" in Settings, and for other test
 * accounts, so a reviewer still sees their demo company.
 *
 * This only trims lists to pick from. Someone's name on work they already
 * did (a task's assignee, a worklog's author) is still shown.
 */

import { db } from '@/lib/mongodb/db-client';

type PersonFlags = {
  id?: string;
  status?: string | null;
  isTestAccount?: boolean | null;
  demoSeed?: string | null;
  email?: string | null;
  showTestAccounts?: boolean | null;
};

const FLAGS_SELECT = {
  id: true,
  status: true,
  isTestAccount: true,
  demoSeed: true,
  email: true,
  showTestAccounts: true,
} as const;

/** The App Store review account (lib/mobile/testSignIn.ts), when set. */
const reviewEmail = () =>
  process.env.MOBILE_TEST_EMAIL?.trim().toLowerCase() || null;

/**
 * True for a test account: marked by an admin, made by a seed script, or the
 * account the store reviewers sign in to.
 */
export const isTestAccount = (user?: PersonFlags | null) =>
  !!user?.isTestAccount ||
  !!user?.demoSeed ||
  (!!user?.email && user.email.toLowerCase() === reviewEmail());

/** Records without a status are older active accounts. */
const isActive = (user: PersonFlags) =>
  !user.status || user.status === 'ACTIVE';

/** Whether the viewer sees test accounts in lists. */
export const seesTestAccounts = (viewer?: PersonFlags | null) =>
  !!viewer?.showTestAccounts || isTestAccount(viewer);

/**
 * The ids, of those given, that the viewer should see in a list of people,
 * in the same order. The viewer themself is always kept.
 */
export async function listablePeopleIds(
  viewerId: string | null | undefined,
  ids: string[],
): Promise<string[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return [];
  const records: PersonFlags[] = await db.user.findMany({
    where: {
      id: {
        in: Array.from(new Set([...unique, ...(viewerId ? [viewerId] : [])])),
      },
    },
    select: FLAGS_SELECT,
  });
  const byId = new Map(records.map((r) => [String(r.id), r]));
  const showTests = seesTestAccounts(viewerId ? byId.get(viewerId) : null);
  const keep = new Set(
    records
      .filter(
        (r) =>
          r.id === viewerId ||
          (isActive(r) && (showTests || !isTestAccount(r))),
      )
      .map((r) => String(r.id)),
  );
  return unique.filter((id) => keep.has(id));
}

/** `listablePeopleIds` as a set, for filtering other shapes. */
export async function listablePeople(
  viewerId: string | null | undefined,
  ids: string[],
): Promise<Set<string>> {
  return new Set(await listablePeopleIds(viewerId, ids));
}
