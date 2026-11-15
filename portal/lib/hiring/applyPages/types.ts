/**
 * A designed apply page, shown at /apply/<slug> instead of the standard one
 * when an opening picks it. Only the look and a few hand-written notes live
 * here: the headline, summary, sections and form all come from the opening.
 *
 * How the opening's words are drawn:
 * - The summary's first paragraph is the big headline; **bold** words in it
 *   get a red marker circle. The other paragraphs sit under it.
 * - Each section of the details (a heading and what follows) is a card.
 * - A section that is only a numbered list is drawn as a row of steps.
 */
export interface ApplyPageConfig {
  key: string;
  /** How the opening editor names it. */
  name: string;
  /** The small label over the headline. */
  kicker: string;
  /** Hand-written notes in red marker beside the film and the form. */
  notes: { video: string; form: string };
  /** The film frame before the opening has a showcase video. */
  videoSoon: { title: string; body: string };
  /**
   * A details section whose heading starts with this is drawn as the dark,
   * full-width highlight card.
   */
  spotlight?: string;
  form: {
    title: string;
    submit: string;
    sentTitle: string;
    /** `{firstName}` and `{email}` are filled in. */
    sentBody: string;
  };
}
