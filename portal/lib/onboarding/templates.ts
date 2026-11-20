import { db } from '@/lib/mongodb/db-client';
import {
  DEFAULT_DOCUMENTS,
  MAX_DOC_BODY,
  MAX_DOC_TITLE,
} from '@/lib/onboarding/documents';
import {
  AGREEMENT_ROUND,
  BUILT_IN_DOCS,
  DOC_LABEL,
  docKey,
} from '@/lib/onboarding/meta';
import { OnboardingError } from '@/lib/onboarding/server';
import { nowIso } from '@/lib/workspace/server';
import {
  ONBOARDING_DOC_KIND,
  type OnboardingTemplate,
} from '@/models/onboarding';

/*
 * A company's onboarding documents: the four built in (Trial Policy, NDA,
 * Offer Letter, Work Agreement) and any it adds itself, which are signed
 * before portal access. The Documents tab and Claude's tools both go
 * through here.
 */

export const MAX_OWN_DOCUMENTS = 30;

const isBuiltIn = (v: unknown): v is ONBOARDING_DOC_KIND =>
  BUILT_IN_DOCS.includes(v as ONBOARDING_DOC_KIND);

const isOwnKey = (key: unknown): key is string =>
  typeof key === 'string' && key.startsWith('custom:');

const textOf = (value: unknown, max: number) =>
  typeof value === 'string' ? value.slice(0, max) : null;

const fail = (status: number, message: string): never => {
  throw new OnboardingError(status, message);
};

/** One document as the Documents tab, the send dialogs and Claude see it. */
export function templateView(
  kind: ONBOARDING_DOC_KIND,
  t: OnboardingTemplate | undefined,
) {
  const draft = DEFAULT_DOCUMENTS[kind];
  const own = kind === ONBOARDING_DOC_KIND.CUSTOM;
  return {
    key: own ? docKey({ kind, id: t!.id }) : kind,
    kind,
    id: own ? t!.id : null,
    label: own ? t!.title : DOC_LABEL[kind],
    title: t?.title ?? draft.title,
    body: t?.body ?? draft.body,
    /** A document the company added itself (not one of the four built in). */
    own,
    /** Reworded from the starting draft (always true for its own). */
    custom: own || (!!t && (t.title !== draft.title || t.body !== draft.body)),
    /** Signed before portal access (otherwise with the offer). */
    beforeAccess: AGREEMENT_ROUND.includes(kind),
    sendByDefault: t?.sendByDefault !== false,
    updatedAt: t?.updatedAt ?? null,
  };
}

export type TemplateView = ReturnType<typeof templateView>;

/** The four built in, then the company's own in the order they were added. */
export async function listTemplates(companyId: string) {
  const rows: OnboardingTemplate[] = await db.onboardingTemplate.findMany({
    where: { companyId },
    orderBy: { createdAt: 'asc' },
  });
  return [
    ...BUILT_IN_DOCS.map((kind) =>
      templateView(
        kind,
        rows.find((r) => r.kind === kind),
      ),
    ),
    ...rows
      .filter((r) => r.kind === ONBOARDING_DOC_KIND.CUSTOM)
      .map((r) => templateView(ONBOARDING_DOC_KIND.CUSTOM, r)),
  ];
}

/** A document by key, kind or title (Claude may name it by its title). */
export async function findTemplate(companyId: string, ref: unknown) {
  if (typeof ref !== 'string' || !ref.trim()) return null;
  const want = ref.trim().toLowerCase();
  const all = await listTemplates(companyId);
  return (
    all.find((t) => t.key.toLowerCase() === want) ??
    all.find((t) => t.title.trim().toLowerCase() === want) ??
    all.find((t) => t.label.trim().toLowerCase() === want) ??
    null
  );
}

/** Adds a document of the company's own; it isn't sent until ticked on. */
export async function addTemplate(
  companyId: string,
  actorId: string,
  input: { title?: unknown; body?: unknown; sendByDefault?: unknown },
) {
  const count = await db.onboardingTemplate.count({
    where: { companyId, kind: ONBOARDING_DOC_KIND.CUSTOM },
  });
  if (count >= MAX_OWN_DOCUMENTS)
    fail(409, `Up to ${MAX_OWN_DOCUMENTS} documents of your own.`);
  const draft = DEFAULT_DOCUMENTS[ONBOARDING_DOC_KIND.CUSTOM];
  const now = nowIso();
  const created: OnboardingTemplate = await db.onboardingTemplate.create({
    data: {
      companyId,
      kind: ONBOARDING_DOC_KIND.CUSTOM,
      title: textOf(input.title, MAX_DOC_TITLE)?.trim() || draft.title,
      body: textOf(input.body, MAX_DOC_BODY)?.trim() || draft.body,
      sendByDefault: input.sendByDefault === true,
      updatedById: actorId,
      createdAt: now,
      updatedAt: now,
    },
  });
  return templateView(ONBOARDING_DOC_KIND.CUSTOM, created);
}

/**
 * Saves a document by key (or a built-in kind). Anything left out stays as
 * it is; documents already sent keep the text they were sent with.
 */
export async function saveTemplate(
  companyId: string,
  actorId: string,
  key: unknown,
  input: { title?: unknown; body?: unknown; sendByDefault?: unknown },
) {
  const title = textOf(input.title, MAX_DOC_TITLE)?.trim();
  const text = textOf(input.body, MAX_DOC_BODY);
  if (title === '' || text?.trim() === '')
    fail(400, 'Add a title and the text.');
  const now = nowIso();
  const patch: Partial<OnboardingTemplate> = {
    ...(title ? { title } : {}),
    ...(text ? { body: text } : {}),
    ...(typeof input.sendByDefault === 'boolean'
      ? { sendByDefault: input.sendByDefault }
      : {}),
    updatedById: actorId,
    updatedAt: now,
  };
  if (isOwnKey(key)) {
    const found: OnboardingTemplate | null =
      await db.onboardingTemplate.findFirst({
        where: {
          id: key.slice(7),
          companyId,
          kind: ONBOARDING_DOC_KIND.CUSTOM,
        },
      });
    if (!found) return fail(404, 'That document is gone.');
    const saved: OnboardingTemplate = await db.onboardingTemplate.update({
      where: { id: found.id },
      data: patch,
    });
    return templateView(ONBOARDING_DOC_KIND.CUSTOM, { ...found, ...saved });
  }
  if (!isBuiltIn(key)) return fail(400, 'Unknown document.');
  const found: OnboardingTemplate | null =
    await db.onboardingTemplate.findFirst({ where: { companyId, kind: key } });
  if (found) {
    await db.onboardingTemplate.update({
      where: { id: found.id },
      data: patch,
    });
    return templateView(key, { ...found, ...patch });
  }
  const created: OnboardingTemplate = await db.onboardingTemplate.create({
    data: {
      companyId,
      kind: key,
      title: DEFAULT_DOCUMENTS[key].title,
      body: DEFAULT_DOCUMENTS[key].body,
      ...patch,
      createdAt: now,
    },
  });
  return templateView(key, created);
}

/**
 * A built-in document goes back to the starting draft (its "ticked for new
 * hires" choice stays); one of the company's own is removed. Documents
 * already sent keep their text.
 */
export async function removeTemplate(companyId: string, key: unknown) {
  if (isOwnKey(key)) {
    await db.onboardingTemplate.deleteMany({
      where: { id: key.slice(7), companyId, kind: ONBOARDING_DOC_KIND.CUSTOM },
    });
    return { deleted: true };
  }
  if (!isBuiltIn(key)) return fail(400, 'Unknown document.');
  const found: OnboardingTemplate | null =
    await db.onboardingTemplate.findFirst({ where: { companyId, kind: key } });
  if (found?.sendByDefault === false)
    await db.onboardingTemplate.update({
      where: { id: found.id },
      data: {
        title: DEFAULT_DOCUMENTS[key].title,
        body: DEFAULT_DOCUMENTS[key].body,
        updatedAt: nowIso(),
      },
    });
  else
    await db.onboardingTemplate.deleteMany({ where: { companyId, kind: key } });
  return { reset: true };
}
