import { APPLY_PAGES, youtubeEmbedUrl } from '@/lib/hiring/applyPages';
import { JOB_OPENING_STATUS, type JobOpening } from '@/models/hiring';
import type { Company } from '@/models/workspace';

import type { PublicOpening } from './ApplyPage';

/** An opening and its company, as much as a candidate may see. */
export const toPublicOpening = (
  opening: JobOpening,
  company: Company | null,
  { preview = false } = {},
): PublicOpening => ({
  slug: opening.slug,
  title: opening.title,
  department: opening.department ?? null,
  location: opening.location ?? null,
  employmentType: opening.employmentType ?? null,
  description: opening.description ?? null,
  details: opening.details ?? null,
  // The preview shows the form even while the opening is a draft.
  isOpen: preview || opening.status === JOB_OPENING_STATUS.OPEN,
  fields: opening.fields ?? [],
  company: {
    name: company?.name ?? 'The Moon Devs',
    logo: company?.logo ?? null,
    color: company?.color ?? null,
  },
  applyPage:
    opening.applyPage && opening.applyPage in APPLY_PAGES
      ? opening.applyPage
      : null,
  showcaseEmbed: youtubeEmbedUrl(opening.showcaseVideo),
  preview,
});
