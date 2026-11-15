import type { ApplyPageConfig } from './types';

/**
 * A director's sketchbook on a film set: grainy paper, red marker notes, a
 * showcase film in a sprocketed frame, the role in a few cards, and the form
 * right under them. Made for FRONTIER's AI Filmmaker & Content Creator.
 */
export const filmSlatePage: ApplyPageConfig = {
  key: 'film-slate',
  name: 'Film slate',
  kicker: 'Now hiring',
  notes: {
    video: 'watch this first',
    form: 'takes a few minutes',
  },
  videoSoon: {
    title: 'Showcase film',
    body: 'Premieres here soon.',
  },
  spotlight: 'First Cut',
  form: {
    title: 'Apply.',
    submit: 'Send application',
    sentTitle: 'Received. Thank you.',
    sentBody:
      'We read every application, {firstName}. You’ll hear from us at {email}.',
  },
};
