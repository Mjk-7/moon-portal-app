import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import {
  ApplyPage,
  type PublicOpening,
} from '@/components/screens/Apply/ApplyPage';
import { DesignedApplyPage } from '@/components/screens/Apply/DesignedApplyPage';
import { toPublicOpening } from '@/components/screens/Apply/publicOpening';
import { db } from '@/lib/mongodb/db-client';
import type { JobOpening } from '@/models/hiring';
import { JOB_OPENING_STATUS } from '@/models/hiring';
import type { Company } from '@/models/workspace';

export const dynamic = 'force-dynamic';

type Props = { params: { slug: string } };

/** The opening and its company, as much as a candidate may see. */
const loadOpening = cache(
  async (slug: string): Promise<PublicOpening | null> => {
    const opening: JobOpening | null = await db.jobOpening.findFirst({
      where: { slug },
    });
    if (
      !opening ||
      opening.status === JOB_OPENING_STATUS.DRAFT ||
      opening.status === JOB_OPENING_STATUS.ARCHIVED
    )
      return null;
    const company: Company | null = await db.company.findFirst({
      where: { id: opening.companyId },
    });
    return toPublicOpening(opening, company);
  },
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const opening = await loadOpening(params.slug);
  if (!opening) return { title: 'Opening not found' };
  const title = `${opening.title} · ${opening.company.name}`;
  const description = `We’re hiring. Apply for ${opening.title} at ${opening.company.name}.`;
  // The image itself comes from opengraph-image.tsx next to this page.
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function Apply({ params }: Props) {
  const opening = await loadOpening(params.slug);
  if (!opening) notFound();
  return opening.applyPage ? (
    <DesignedApplyPage opening={opening} />
  ) : (
    <ApplyPage opening={opening} />
  );
}
