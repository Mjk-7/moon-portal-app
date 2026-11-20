import type { JSONContent } from '@tiptap/react';

import { markdownToDoc } from '@/lib/workspace/pageMarkdown';

/** A lesson's page: its saved page, or older Markdown turned into one. */
export const lessonDoc = (lesson: {
  body: string;
  content?: unknown;
}): JSONContent =>
  (lesson.content as JSONContent | null | undefined) ??
  (markdownToDoc(lesson.body || '') as JSONContent);
