import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ApplyPage } from '@/components/screens/Apply/ApplyPage';
import { DesignedApplyPage } from '@/components/screens/Apply/DesignedApplyPage';
import { toPublicOpening } from '@/components/screens/Apply/publicOpening';
import { requireOpeningPermission } from '@/lib/hiring/server';
import { db } from '@/lib/mongodb/db-client';
import type { Company } from '@/models/workspace';

export const dynamic = 'force-dynamic';

type Props = { params: { openingId: string } };

export const metadata: Metadata = {
  title: 'Apply page preview',
  robots: { index: false, follow: false },
};

/**
 * The hiring team's look at an opening's apply page, drafts included, as a
 * candidate would see it. The form checks answers but sends nothing.
 */
export default async function ApplyPreview({ params }: Props) {
  const { response, opening } = await requireOpeningPermission(
    params.openingId,
    'hiring:read',
  );
  if (response || !opening) notFound();
  const company: Company | null = await db.company.findFirst({
    where: { id: opening.companyId },
  });
  const data = toPublicOpening(opening, company, { preview: true });
  return data.applyPage ? (
    <DesignedApplyPage opening={data} />
  ) : (
    <ApplyPage opening={data} />
  );
}
