import { onboardingFailure } from '@/lib/onboarding/http';
import { requireInCompany } from '@/lib/onboarding/server';
import {
  addTemplate,
  listTemplates,
  removeTemplate,
  saveTemplate,
} from '@/lib/onboarding/templates';
import { getSessionUser, type SessionUser } from '@/lib/permissions/server';
import { fail, ok } from '@/lib/workspace/server';

export const dynamic = 'force-dynamic';

async function actorFor(companyId: unknown, permission: string) {
  const actor = await getSessionUser();
  if (!actor) return { error: fail(401, 'Authentication required.') };
  if (typeof companyId !== 'string')
    return { error: fail(400, 'companyId is required.') };
  await requireInCompany(actor, companyId, permission);
  return { actor: actor as SessionUser, companyId };
}

/** The company's documents: the four built in, then its own. */
export async function GET(request: Request) {
  try {
    const got = await actorFor(
      new URL(request.url).searchParams.get('companyId'),
      'hiring:read',
    );
    if ('error' in got) return got.error;
    return ok({ templates: await listTemplates(got.companyId) });
  } catch (e) {
    return onboardingFailure(e);
  }
}

/** Adds a document of the company's own: `{ companyId, title?, body? }`. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const got = await actorFor(body.companyId, 'hiring:edit');
    if ('error' in got) return got.error;
    return ok({
      template: await addTemplate(got.companyId, got.actor.id, body),
    });
  } catch (e) {
    return onboardingFailure(e);
  }
}

/**
 * Saves a document: `{ companyId, key (or kind), title?, body?,
 * sendByDefault? }`.
 */
export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const got = await actorFor(body.companyId, 'hiring:edit');
    if ('error' in got) return got.error;
    const key = typeof body.key === 'string' ? body.key : body.kind;
    await saveTemplate(got.companyId, got.actor.id, key, body);
    return ok({ saved: true });
  } catch (e) {
    return onboardingFailure(e);
  }
}

/**
 * `?companyId&key`: a built-in document goes back to the starting draft;
 * one of the company's own is removed (documents already sent keep it).
 */
export async function DELETE(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const got = await actorFor(params.get('companyId'), 'hiring:edit');
    if ('error' in got) return got.error;
    return ok(
      await removeTemplate(
        got.companyId,
        params.get('key') ?? params.get('kind'),
      ),
    );
  } catch (e) {
    return onboardingFailure(e);
  }
}
