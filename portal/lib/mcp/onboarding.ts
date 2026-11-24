import {
  courseIsReady,
  courseView,
  ensureIntroCourse,
  parseCourseInput,
} from '@/lib/courses/server';
import { db } from '@/lib/mongodb/db-client';
import {
  DOC_PLACEHOLDERS,
  unknownDocPlaceholders,
} from '@/lib/onboarding/documents';
import {
  formatDay,
  formatMoney,
  HIRE_TYPE_LABEL,
  hireNext,
  OFFER_DOCS,
  STEP_LABEL,
  trialLength,
  trialPayFor,
} from '@/lib/onboarding/meta';
import {
  agreementKeysFor,
  decideTrial,
  endOnboarding,
  OnboardingError,
  parseOffer,
  parseTerms,
  renderDocuments,
  resendStepEmail,
  sendAgreements,
  startOnboarding,
} from '@/lib/onboarding/server';
import {
  addTemplate,
  findTemplate,
  listTemplates,
  removeTemplate,
  saveTemplate,
} from '@/lib/onboarding/templates';
import { hireView, onboardingBoard } from '@/lib/onboarding/view';
import type { SessionUser } from '@/lib/permissions/server';
import { nowIso } from '@/lib/workspace/server';
import {
  type Course,
  type Onboarding,
  ONBOARDING_STEP,
} from '@/models/onboarding';

import { findCompany } from './hiring';
import { companiesWith, type Tool, ToolError } from './shared';

/*
 * Onboarding through Claude: the same steps as the Onboarding tab. Most
 * hiring managers run hiring from the Claude app, so every step the tab
 * offers has a tool here, with the same rules.
 */

const canHire = async (user: SessionUser) =>
  (await companiesWith(user, 'hiring:read')).size > 0;
const canWriteCourses = async (user: SessionUser) =>
  (await companiesWith(user, 'courses:edit')).size > 0;

const hireLink = (origin: string, o: { id: string; companyId: string }) =>
  `${origin}/hiring?view=onboarding&company=${o.companyId}&hire=${o.id}`;

/** Wraps onboarding errors as answers Claude can act on. */
async function attempt<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof OnboardingError) throw new ToolError(e.message);
    throw e;
  }
}

/** A hire by id, name or email, in the companies where `permission` holds. */
async function findHire(
  user: SessionUser,
  ref: unknown,
  permission: string,
): Promise<Onboarding> {
  const wanted = typeof ref === 'string' ? ref.trim() : '';
  if (!wanted)
    throw new ToolError(
      'Say which hire: their id (from list_new_hires), name or email.',
    );
  const companies = Array.from((await companiesWith(user, permission)).keys());
  if (!companies.length)
    throw new ToolError(`You don't have ${permission} in any company.`);
  const rows: Onboarding[] = await db.onboarding.findMany({
    where: { companyId: { in: companies } },
    orderBy: { updatedAt: 'desc' },
  });
  const lower = wanted.toLowerCase();
  const byId = rows.find((o) => o.id === wanted);
  if (byId) return byId;
  const matches = rows.filter(
    (o) =>
      o.email === lower ||
      o.name.toLowerCase() === lower ||
      o.name.toLowerCase().includes(lower),
  );
  const live = matches.filter(
    (o) => o.step !== ONBOARDING_STEP.ENDED && o.step !== ONBOARDING_STEP.HIRED,
  );
  const pick = live.length ? live : matches;
  if (pick.length === 1) return pick[0];
  if (!pick.length) throw new ToolError(`No hire matches "${wanted}".`);
  throw new ToolError(
    `Several hires match "${wanted}": ${pick
      .map((o) => `${o.name} (${o.email}, ${o.id})`)
      .join('; ')}. Use the id.`,
  );
}

/** One plain line on what a hire is waiting for, and who moves next. */
const nextMove = (o: Onboarding) => hireNext(o).text;

const summary = (o: Onboarding, origin: string) => ({
  id: o.id,
  name: o.name,
  email: o.email,
  step: STEP_LABEL[o.step],
  role: o.terms?.role ?? null,
  hireType: o.terms ? HIRE_TYPE_LABEL[o.terms.hireType] : null,
  next: nextMove(o),
  trial: o.trialStartsOn
    ? `${formatDay(o.trialStartsOn)} to ${formatDay(o.trialEndsOn)}`
    : null,
  url: hireLink(origin, o),
});

const DOCUMENTS_SCHEMA = {
  type: 'array',
  items: { type: 'string' },
  description:
    'The documents to sign before access, by key or title from list_onboarding_documents (e.g. ["NDA"]). Left out: the company\'s defaults. []: none.',
};

const TERMS_SCHEMA = {
  type: 'object',
  description:
    'What the agreements are written from. Ask the person for anything you do not know; never guess pay.',
  properties: {
    companyName: {
      type: 'string',
      description: 'The company name as it reads in the agreements.',
    },
    role: { type: 'string' },
    hireType: {
      type: 'string',
      enum: ['INTERN', 'FULL_TIME'],
      description: 'Interns get a 14-day trial, full-time hires 7.',
    },
    monthlyPay: {
      type: 'number',
      description:
        'Their usual monthly pay; the trial payment is worked out from it.',
    },
    currency: {
      type: 'string',
      description: 'INR (default), USD, EUR, GBP, AED or SGD.',
    },
    startDate: {
      type: 'string',
      description: 'First trial day, YYYY-MM-DD. Access day if later.',
    },
    projectId: { type: 'string', description: 'The project they join first.' },
    location: { type: 'string', description: 'Where they work, e.g. Remote.' },
    leadId: {
      type: 'string',
      description:
        'Their hiring manager (user id). Named in the agreements as their contact; a company owner when empty.',
    },
    buddyId: {
      type: 'string',
      description: 'Optional buddy (user id). Can decide the trial too.',
    },
  },
};

export const ONBOARDING_TOOLS: Tool[] = [
  {
    name: 'list_new_hires',
    title: 'List new hires in onboarding',
    description:
      "New hires going through onboarding (details form, documents to sign, trial, offer), what each is waiting on, and hired applicants whose onboarding hasn't started. Also the company's people and projects, for the terms. Start here.",
    inputSchema: {
      type: 'object',
      properties: {
        company: {
          type: 'string',
          description: 'Company id or name (optional with one company).',
        },
        includeFinished: {
          type: 'boolean',
          description: 'Also hires who are fully hired or ended.',
        },
      },
    },
    annotations: { readOnlyHint: true },
    visible: canHire,
    run: async (user, args, context) => {
      const company = await findCompany(user, args?.company, 'hiring:read');
      const rows: Onboarding[] = await db.onboarding.findMany({
        where: { companyId: company.id },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      });
      const board = await onboardingBoard(company.id);
      const live = rows.filter(
        (o) =>
          args?.includeFinished ||
          (o.step !== ONBOARDING_STEP.ENDED &&
            o.step !== ONBOARDING_STEP.HIRED),
      );
      return {
        company: { id: company.id, name: company.name },
        hires: live.map((o) => summary(o, context.origin)),
        readyToOnboard: board.readyToOnboard,
        people: board.people.map((p) => ({
          id: p!.id,
          name: p!.name,
          title: p!.title,
          isOwner: p!.isOwner,
        })),
        projects: board.projects,
        tab: `${context.origin}/hiring?view=onboarding`,
      };
    },
  },
  {
    name: 'get_new_hire',
    title: 'Get one new hire',
    description:
      'One hire in full: their details, the terms, trial dates and pay, each document with its signature, the decision and the history. Set includeDocuments to read the documents’ text.',
    inputSchema: {
      type: 'object',
      properties: {
        hire: { type: 'string', description: 'Id, name or email.' },
        includeDocuments: { type: 'boolean' },
      },
      required: ['hire'],
    },
    annotations: { readOnlyHint: true },
    visible: canHire,
    run: async (user, args, context) => {
      const o = await findHire(user, args?.hire, 'hiring:read');
      const view = await hireView(o, user, context.origin);
      return {
        ...view,
        next: nextMove(o),
        url: hireLink(context.origin, o),
        documents: view.documents.map((d) => ({
          ...d,
          body: args?.includeDocuments ? d.body : undefined,
        })),
        trialPay: view.trialPay
          ? {
              ...view.trialPay,
              fullText: formatMoney(view.trialPay.full, view.trialPay.currency),
              halfText: formatMoney(view.trialPay.half, view.trialPay.currency),
            }
          : null,
      };
    },
  },
  {
    name: 'start_onboarding',
    title: 'Start onboarding a new hire',
    description:
      "Emails a new hire their details form (personal details and a profile photo), which makes their portal account. Use an applicant id from list_new_hires' readyToOnboard (moves them to Hired), or an email (the name is optional; they give it on the form). Pass terms to have their documents go out by themselves as soon as the form is back. documents picks what they sign before access (keys or titles from list_onboarding_documents, e.g. just the NDA); left out, the company's defaults go. An empty list, or withoutAgreements: true, means no documents, so their access opens once the details and terms are in. With documents, access opens only after both the hire and the company have signed. Confirm with the person before calling: it sends an email.",
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string' },
        applicationId: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' },
        terms: TERMS_SCHEMA,
        documents: DOCUMENTS_SCHEMA,
        withoutAgreements: {
          type: 'boolean',
          description: 'Onboard without any documents to sign.',
        },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    visible: canHire,
    run: async (user, args, context) =>
      attempt(async () => {
        const company = await findCompany(user, args?.company, 'hiring:edit');
        const { onboarding, emailError } = await startOnboarding(
          user,
          {
            companyId: company.id,
            applicationId: args?.applicationId ?? null,
            name: args?.name ?? null,
            email: args?.email ?? null,
            terms: args?.terms ?? null,
            documents: Array.isArray(args?.documents) ? args.documents : null,
            withoutAgreements: args?.withoutAgreements === true,
          },
          context.origin,
        );
        return { ...summary(onboarding, context.origin), emailError };
      }),
  },
  {
    name: 'send_agreements',
    title: 'Send the agreements to sign',
    description:
      "Fills in the agreement terms and sends the documents to sign before access: the ones in documents (keys or titles from list_onboarding_documents, e.g. only the NDA, or the NDA and a company document), else the ones picked when onboarding started, else the company's defaults. Before the details form is back, the terms are saved and go out by themselves. An empty documents list, or withoutAgreements: true, sends nothing and opens their portal access as soon as their details are in (right away if they already are). Otherwise access opens once the hire has signed and the company has countersigned. Use preview: true first and show the person the documents, the terms and the contact named; send only after they say yes.",
    inputSchema: {
      type: 'object',
      properties: {
        hire: { type: 'string', description: 'Id, name or email.' },
        terms: TERMS_SCHEMA,
        preview: {
          type: 'boolean',
          description: 'Return the documents without saving or sending.',
        },
        documents: DOCUMENTS_SCHEMA,
        withoutAgreements: {
          type: 'boolean',
          description: 'Send no documents and open their access instead.',
        },
      },
      required: ['hire', 'terms'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    visible: canHire,
    run: async (user, args, context) =>
      attempt(async () => {
        const o = await findHire(user, args?.hire, 'hiring:edit');
        if (args?.preview) {
          const terms = await parseTerms(o.companyId, args?.terms ?? {});
          const pay = trialPayFor(
            terms.monthlyPay,
            terms.hireType,
            terms.currency,
          );
          const keys = await agreementKeysFor(o, {
            withoutAgreements:
              typeof args?.withoutAgreements === 'boolean'
                ? args.withoutAgreements
                : undefined,
            documents: Array.isArray(args?.documents) ? args.documents : null,
          });
          const docs = await renderDocuments(o, keys, terms);
          return {
            preview: true,
            ...(keys.length
              ? {}
              : {
                  note: 'No documents: their portal access opens once their details are in.',
                }),
            trialPay: `${formatMoney(pay.full, pay.currency)} for the ${trialLength(terms.hireType)} if confirmed; ${formatMoney(pay.half, pay.currency)} if the trial ends (written into the Trial Policy)`,
            documents: docs.map((d) => ({ title: d.title, body: d.body })),
          };
        }
        const { onboarding, emailError } = await sendAgreements(
          user,
          o,
          args?.terms ?? {},
          context.origin,
          {
            ...(typeof args?.withoutAgreements === 'boolean'
              ? { withoutAgreements: args.withoutAgreements }
              : {}),
            ...(Array.isArray(args?.documents)
              ? { documents: args.documents }
              : {}),
          },
        );
        return { ...summary(onboarding, context.origin), emailError };
      }),
  },
  {
    name: 'decide_trial',
    title: 'Confirm or end a trial',
    description:
      "Ends a new hire's trial. ACCEPTED sends the offer letter and Work Agreement to sign (a trial can be confirmed early); they already have Claude from the trial. REJECTED closes all their portal access, Claude included, and records half the trial pay as owed. Only their hiring manager, buddy or a company owner can decide. Use preview: true for the offer first, and get the person's explicit OK before deciding: it can't be undone.",
    inputSchema: {
      type: 'object',
      properties: {
        hire: { type: 'string' },
        outcome: { type: 'string', enum: ['ACCEPTED', 'REJECTED'] },
        offer: {
          type: 'object',
          description: 'For ACCEPTED. Defaults come from the trial terms.',
          properties: {
            role: { type: 'string' },
            hireType: { type: 'string', enum: ['INTERN', 'FULL_TIME'] },
            monthlyPay: { type: 'number' },
            currency: { type: 'string' },
            joiningDate: { type: 'string', description: 'YYYY-MM-DD' },
            noticeDays: { type: 'number', description: 'Default 15.' },
            note: {
              type: 'string',
              description: 'An extra paragraph for the offer letter.',
            },
          },
        },
        note: {
          type: 'string',
          description: 'Why, for the record (not emailed).',
        },
        notify: { type: 'boolean', description: 'Email them (default true).' },
        preview: {
          type: 'boolean',
          description:
            'ACCEPTED only: return the offer documents without sending.',
        },
      },
      required: ['hire', 'outcome'],
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
    visible: canHire,
    run: async (user, args, context) =>
      attempt(async () => {
        const o = await findHire(user, args?.hire, 'hiring:edit');
        if (args?.preview) {
          if (args?.outcome !== 'ACCEPTED' || !o.terms)
            throw new ToolError(
              'Preview works for ACCEPTED, once the trial terms exist.',
            );
          const offer = parseOffer(args?.offer ?? {}, o.terms);
          const docs = await renderDocuments(o, OFFER_DOCS, o.terms, offer);
          return {
            preview: true,
            offer,
            documents: docs.map((d) => ({ title: d.title, body: d.body })),
          };
        }
        const { onboarding, emailError } = await decideTrial(
          user,
          o,
          {
            outcome: args?.outcome,
            offer: args?.offer ?? null,
            note: args?.note ?? null,
            notify: args?.notify !== false,
          },
          context.origin,
        );
        return {
          ...summary(onboarding, context.origin),
          decision: onboarding.decision,
          emailError,
        };
      }),
  },
  {
    name: 'resend_onboarding_email',
    title: 'Send a hire their onboarding email again',
    description:
      'Emails the step they are on again: the details form, the agreements, their sign-in (on trial) or the offer.',
    inputSchema: {
      type: 'object',
      properties: { hire: { type: 'string' } },
      required: ['hire'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    visible: canHire,
    run: async (user, args, context) =>
      attempt(async () => {
        const o = await findHire(user, args?.hire, 'hiring:edit');
        const { onboarding, emailError } = await resendStepEmail(
          user,
          o,
          context.origin,
        );
        return { ...summary(onboarding, context.origin), emailError };
      }),
  },
  {
    name: 'stop_onboarding',
    title: 'Stop onboarding a hire',
    description:
      'Stops onboarding when someone withdraws or declines the offer, and closes any access they have. On trial this ends the trial (half pay owed). Confirm with the person first.',
    inputSchema: {
      type: 'object',
      properties: {
        hire: { type: 'string' },
        note: { type: 'string' },
        notify: {
          type: 'boolean',
          description: 'On trial: email them (default true).',
        },
      },
      required: ['hire'],
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
    visible: canHire,
    run: async (user, args, context) =>
      attempt(async () => {
        const o = await findHire(user, args?.hire, 'hiring:edit');
        const { onboarding } = await endOnboarding(
          user,
          o,
          { note: args?.note ?? null, notify: args?.notify !== false },
          context.origin,
        );
        return summary(onboarding, context.origin);
      }),
  },
  {
    name: 'list_onboarding_documents',
    title: 'List onboarding document templates',
    description:
      "The company's onboarding documents as templates (Markdown with {{placeholders}}), and the placeholders they can use. The Trial Policy and NDA, plus any the company added itself, are signed before portal access (beforeAccess); sendByDefault says whether a new hire gets one unless told otherwise. The Offer Letter and Work Agreement go with the offer. Use a document's key (or title) to pick it for a hire or to edit it.",
    inputSchema: {
      type: 'object',
      properties: { company: { type: 'string' } },
    },
    annotations: { readOnlyHint: true },
    visible: canHire,
    run: async (user, args) => {
      const company = await findCompany(user, args?.company, 'hiring:read');
      const all = await listTemplates(company.id);
      return {
        placeholders: DOC_PLACEHOLDERS,
        documents: all.map((t) => ({
          key: t.key,
          label: t.label,
          title: t.title,
          own: t.own,
          custom: t.custom,
          beforeAccess: t.beforeAccess,
          sendByDefault: t.beforeAccess ? t.sendByDefault : undefined,
          body: t.body,
        })),
      };
    },
  },
  {
    name: 'save_onboarding_document',
    title: 'Save an onboarding document template',
    description:
      "Saves the company's wording for one document, adds a new document of its own (leave out document; it is signed before portal access), or removes one (remove: true; a built-in one goes back to its starting draft). sendByDefault sets whether new hires get a before-access document unless told otherwise; a new one starts off unless you set it. Documents already sent keep the text they were sent with. Show the person the change first.",
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string' },
        document: {
          type: 'string',
          description:
            'Key or title from list_onboarding_documents. Leave out to add a new document.',
        },
        title: { type: 'string' },
        body: {
          type: 'string',
          description: 'Markdown with {{placeholders}}.',
        },
        sendByDefault: { type: 'boolean' },
        remove: { type: 'boolean' },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
    visible: canHire,
    run: async (user, args) =>
      attempt(async () => {
        const company = await findCompany(user, args?.company, 'hiring:edit');
        const body = typeof args?.body === 'string' ? args.body : undefined;
        const unknown = body ? unknownDocPlaceholders(body) : [];
        if (unknown.length)
          throw new ToolError(
            `Unknown placeholders: ${unknown.join(', ')}. Use list_onboarding_documents for the list.`,
          );
        const input = {
          title: args?.title,
          body,
          sendByDefault: args?.sendByDefault,
        };
        if (args?.document === undefined || args?.document === null) {
          if (args?.remove) throw new ToolError('Name the document to remove.');
          if (!String(args?.title ?? '').trim() || !body?.trim())
            throw new ToolError('Add a title and the text.');
          const added = await addTemplate(company.id, user.id, input);
          return { added: added.title, key: added.key };
        }
        const found = await findTemplate(company.id, args.document);
        if (!found)
          throw new ToolError(
            'No such document. Use list_onboarding_documents for the list.',
          );
        if (args?.remove) {
          await removeTemplate(company.id, found.key);
          return found.own
            ? { removed: found.title }
            : { reset: `${found.label} is back to the starting draft.` };
        }
        if (input.sendByDefault !== undefined && !found.beforeAccess)
          throw new ToolError(
            `${found.label} always goes with the offer; only documents signed before access can be ticked on or off.`,
          );
        const saved = await saveTemplate(company.id, user.id, found.key, input);
        return {
          saved: saved.title,
          key: saved.key,
          ...(saved.beforeAccess ? { sendByDefault: saved.sendByDefault } : {}),
        };
      }),
  },
  {
    name: 'list_courses',
    title: 'List courses',
    description:
      "A company's courses, with their lessons. The intro course (Portal usage and guidance) is the one new hires get with their sign-in, but only while ready is true; a course that isn't ready is left out of onboarding emails.",
    inputSchema: {
      type: 'object',
      properties: { company: { type: 'string' } },
    },
    annotations: { readOnlyHint: true },
    visible: canWriteCourses,
    run: async (user, args, context) => {
      const company = await findCompany(user, args?.company, 'courses:read');
      await ensureIntroCourse(company.id, user.id);
      const courses: Course[] = await db.course.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: 'asc' },
      });
      return {
        courses: await Promise.all(
          courses.map(async (c) => ({
            ...(await courseView(c, null)),
            url: `${context.origin}/courses/${c.id}`,
          })),
        ),
      };
    },
  },
  {
    name: 'save_course',
    title: 'Write or update a course',
    description:
      'Creates a course, or with course (an id) replaces its title, description and lessons. Lessons are { id?, title, body } in order, body in Markdown (lessons are pages, like project pages); for a video put <iframe src="https://youtu.be/…"></iframe> on its own line (YouTube, Vimeo, Loom). Keep ids of lessons you keep so progress stays. ready marks the course set up (true) or not (false): new hires only get the intro course while it is ready. Show the person the outline before saving.',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string' },
        course: {
          type: 'string',
          description: 'Course id to update; leave out to create.',
        },
        title: { type: 'string' },
        description: { type: 'string' },
        ready: {
          type: 'boolean',
          description:
            'Set up and fine to send to new hires. Leave out to keep it as is.',
        },
        lessons: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              body: { type: 'string' },
            },
            required: ['title', 'body'],
          },
        },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    visible: canWriteCourses,
    run: async (user, args, context) => {
      const company = await findCompany(user, args?.company, 'courses:edit');
      const input: Record<string, unknown> = {};
      for (const key of ['title', 'description', 'lessons', 'ready'])
        if (args?.[key] !== undefined) input[key] = args[key];
      const { data, error } = parseCourseInput(input);
      if (error) throw new ToolError(error);
      const now = nowIso();
      let course: Course;
      if (args?.course) {
        const found: Course | null = await db.course.findFirst({
          where: { id: args.course, companyId: company.id },
        });
        if (!found) throw new ToolError('No such course in this company.');
        course = await db.course.update({
          where: { id: found.id },
          data: { ...data, updatedById: user.id, updatedAt: now },
        });
      } else {
        if (!data.title) throw new ToolError('Give the course a title.');
        course = await db.course.create({
          data: {
            companyId: company.id,
            title: data.title,
            description: data.description ?? null,
            isIntro: false,
            ...(typeof data.ready === 'boolean' ? { ready: data.ready } : {}),
            lessons: data.lessons ?? [],
            createdById: user.id,
            updatedById: user.id,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
      return {
        id: course.id,
        title: course.title,
        lessons: (course.lessons ?? []).length,
        ready: courseIsReady(course),
        url: `${context.origin}/courses/${course.id}`,
      };
    },
  },
];
