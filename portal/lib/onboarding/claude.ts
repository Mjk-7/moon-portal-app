import { db } from '@/lib/mongodb/db-client';
import { ONBOARDING_STEP, type Onboarding } from '@/models/onboarding';

/** Why someone cannot connect Claude yet. */
export const CLAUDE_LOCKED_MESSAGE =
  'Claude opens once your Portal access opens. Until then, finish your onboarding steps.';

/** Steps where a hire has Portal access, and so Claude. */
const OPEN_STEPS = [
  ONBOARDING_STEP.TRIAL,
  ONBOARDING_STEP.OFFER,
  ONBOARDING_STEP.HIRED,
];

/**
 * Whether a new hire cannot connect Claude (MCP tokens and app connections)
 * yet: before their Portal access opens, or after it closed. Hires already
 * on trial when Claude opened for trials are unlocked here the first time.
 */
export async function isClaudeLocked(userId: string): Promise<boolean> {
  const user = await db.user.findFirst({
    where: { id: userId },
    select: { claudeLocked: true },
  });
  if (!user?.claudeLocked) return false;
  const open: Onboarding | null = await db.onboarding.findFirst({
    where: { userId, step: { in: OPEN_STEPS } },
  });
  if (!open) return true;
  await db.user.update({
    where: { id: userId },
    data: { claudeLocked: false, updatedAt: new Date() },
  });
  return false;
}
