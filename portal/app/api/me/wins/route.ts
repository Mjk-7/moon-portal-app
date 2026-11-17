import { markWinsSeen, setWinsOff, unseenWins, winsOff } from '@/lib/wins/send';
import { fail, ok, requireUser } from '@/lib/workspace/server';

export const dynamic = 'force-dynamic';

/** Wins to celebrate on a card, and whether win notifications are on. */
export async function GET() {
  const { response, user } = await requireUser();
  if (response || !user)
    return response ?? fail(401, 'Authentication required.');
  const [wins, off] = await Promise.all([
    unseenWins(user.id),
    winsOff(user.id),
  ]);
  return ok({
    on: !off,
    wins: wins.map((w) => ({
      id: w.id,
      kind: w.kind,
      emoji: w.emoji,
      title: w.title,
      body: w.body,
      url: w.url,
      createdAt: w.createdAt,
    })),
  });
}

/** `{ seen: [ids] }` marks cards seen; `{ on: boolean }` turns wins on or off. */
export async function POST(request: Request) {
  const { response, user } = await requireUser();
  if (response || !user)
    return response ?? fail(401, 'Authentication required.');
  const body = await request.json().catch(() => ({}));
  if (Array.isArray(body?.seen))
    await markWinsSeen(
      user.id,
      body.seen
        .filter((id: unknown): id is string => typeof id === 'string')
        .slice(0, 50),
    );
  if (typeof body?.on === 'boolean') await setWinsOff(user.id, !body.on);
  return ok({ on: !(await winsOff(user.id)) });
}
