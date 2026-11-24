import type { ChatPerson } from '@/models/chat';

/*
 * The feedback cat: a chat contact in Messages that takes feedback about the
 * portal and files it as a GitHub issue. It is not a person, so it has no
 * User record. Its id is a fixed ObjectId-shaped string so code that expects
 * ObjectIds keeps working.
 */

export const FEEDBACK_BOT_ID = '0000000000000000feedbac0';

/** Its direct chat with `userId`. */
export const feedbackKey = (userId: string) =>
  [userId, FEEDBACK_BOT_ID].sort().join(':');

export const isFeedbackBot = (id: string | null | undefined) =>
  id === FEEDBACK_BOT_ID;

/** Absolute so the mobile app can load it too. */
const base = () =>
  (
    process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://portal.themoondevs.com'
  ).replace(/\/$/, '');

export const FEEDBACK_AVATAR_PATH = '/feedback/cat.png';

export const feedbackBotPerson = (): ChatPerson => ({
  id: FEEDBACK_BOT_ID,
  name: 'Feedback Cat',
  username: 'feedback',
  avatar: `${base()}${FEEDBACK_AVATAR_PATH}`,
  positionTitle: 'Bot · sends your feedback to the team',
  companies: ['Portal'],
  bot: 'feedback',
});

export const WELCOME_TEXT = [
  'Meow! I’m the Feedback Cat 🐾',
  'Tell me what broke, what’s confusing, or what you wish the portal did. I’ll ask a quick question if I need to, show you what I’ll send, and file it for the team.',
  'I can’t help with how-to or account questions. For those, use Support in the menu.',
].join('\n\n');

export const WELCOME_CHIPS = [
  'Report a bug',
  'Something showed an error',
  'Suggest a feature',
  'Something could be better',
];

/** Caps per person per day (UTC), so nobody can run up the bill. */
export const FEEDBACK_LIMITS = {
  repliesPerDay: 60,
  reportsPerDay: 10,
  /** Messages of the current talk Claude reads. */
  historyMessages: 30,
} as const;
