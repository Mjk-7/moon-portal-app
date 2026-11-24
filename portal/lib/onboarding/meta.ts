/*
 * Onboarding rules and labels shared by the admin screens, the hire's /join
 * page, the API and the Claude tools. Client-safe: no database here.
 */
import {
  HIRE_TYPE,
  ONBOARDING_DOC_KIND,
  ONBOARDING_STEP,
  type TrialPay,
} from '@/models/onboarding';

/** Trial length by hire type. Interns get two weeks, full-time hires one. */
export const TRIAL_DAYS: Record<HIRE_TYPE, number> = {
  [HIRE_TYPE.INTERN]: 14,
  [HIRE_TYPE.FULL_TIME]: 7,
};

export const HIRE_TYPE_LABEL: Record<HIRE_TYPE, string> = {
  [HIRE_TYPE.INTERN]: 'Intern',
  [HIRE_TYPE.FULL_TIME]: 'Full-time',
};

/** The built-in documents signed before access, in signing order. */
export const AGREEMENT_DOCS = [
  ONBOARDING_DOC_KIND.TRIAL_POLICY,
  ONBOARDING_DOC_KIND.NDA,
];
/**
 * Every kind signed before access: the built-in ones and the company's own
 * documents. Which of them a hire gets is picked per hire.
 */
export const AGREEMENT_ROUND = [...AGREEMENT_DOCS, ONBOARDING_DOC_KIND.CUSTOM];
/** The built-in documents a company can reword. */
export const BUILT_IN_DOCS = [
  ONBOARDING_DOC_KIND.TRIAL_POLICY,
  ONBOARDING_DOC_KIND.NDA,
  ONBOARDING_DOC_KIND.OFFER_LETTER,
  ONBOARDING_DOC_KIND.WORK_AGREEMENT,
];

/**
 * How a document is picked for a hire: a built-in kind ("NDA") or one of
 * the company's own documents ("custom:<template id>").
 */
export const docKey = (t: { kind: ONBOARDING_DOC_KIND; id?: string | null }) =>
  t.kind === ONBOARDING_DOC_KIND.CUSTOM ? `custom:${t.id}` : t.kind;

/** "Trial Policy, NDA and House Rules". */
export const listTitles = (titles: string[]) =>
  titles.length <= 1
    ? (titles[0] ?? '')
    : `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;
export const OFFER_DOCS = [
  ONBOARDING_DOC_KIND.OFFER_LETTER,
  ONBOARDING_DOC_KIND.WORK_AGREEMENT,
];

export const DOC_LABEL: Record<ONBOARDING_DOC_KIND, string> = {
  [ONBOARDING_DOC_KIND.TRIAL_POLICY]: 'Trial Policy',
  [ONBOARDING_DOC_KIND.NDA]: 'Non-Disclosure Agreement',
  [ONBOARDING_DOC_KIND.OFFER_LETTER]: 'Offer Letter',
  [ONBOARDING_DOC_KIND.WORK_AGREEMENT]: 'Work Agreement',
  [ONBOARDING_DOC_KIND.CUSTOM]: 'Document',
};

/** The steps a hire moves through, as the stepper shows them. */
export const STEPS: Array<{
  step: ONBOARDING_STEP;
  label: string;
  icon: string;
  /** What the hire does at this step, for the stepper's hint. */
  hint: string;
}> = [
  {
    step: ONBOARDING_STEP.DETAILS,
    label: 'Details',
    icon: 'badge',
    hint: 'Fills in their details and photo',
  },
  {
    step: ONBOARDING_STEP.AGREEMENTS,
    label: 'Agreements',
    icon: 'signature',
    hint: 'Signs their agreements, if any',
  },
  {
    step: ONBOARDING_STEP.TRIAL,
    label: 'Trial',
    icon: 'hourglass_top',
    hint: 'Works in the portal on trial',
  },
  {
    step: ONBOARDING_STEP.OFFER,
    label: 'Offer',
    icon: 'contract',
    hint: 'Signs the offer letter',
  },
  {
    step: ONBOARDING_STEP.HIRED,
    label: 'Hired',
    icon: 'verified',
    hint: 'Full member',
  },
];

export const STEP_LABEL: Record<ONBOARDING_STEP, string> = {
  [ONBOARDING_STEP.DETAILS]: 'Details',
  [ONBOARDING_STEP.AGREEMENTS]: 'Agreements',
  [ONBOARDING_STEP.TRIAL]: 'Trial',
  [ONBOARDING_STEP.OFFER]: 'Offer',
  [ONBOARDING_STEP.HIRED]: 'Hired',
  [ONBOARDING_STEP.ENDED]: 'Ended',
};

export const stepIndex = (step: ONBOARDING_STEP) =>
  STEPS.findIndex((s) => s.step === step);

export const isOnboardingStep = (value: unknown): value is ONBOARDING_STEP =>
  Object.values(ONBOARDING_STEP).includes(value as ONBOARDING_STEP);

export const isHireType = (value: unknown): value is HIRE_TYPE =>
  Object.values(HIRE_TYPE).includes(value as HIRE_TYPE);

/* ---------------------------------- money --------------------------------- */

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];

/**
 * The trial payment, counting a month as four weeks: a 2-week trial is half
 * the monthly pay and a 1-week trial a quarter of it (₹20,000 a month gives
 * ₹10,000 and ₹5,000). Half of that is paid when the trial ends.
 */
export function trialPayFor(
  monthlyPay: number,
  hireType: HIRE_TYPE,
  currency: string,
): TrialPay {
  const days = TRIAL_DAYS[hireType];
  const full = Math.round((Math.max(0, monthlyPay) * days) / 7 / 4);
  return { days, currency, full, half: Math.round(full / 2) };
}

/** "2 weeks" or "1 week". */
export const trialLength = (hireType: HIRE_TYPE) => {
  const weeks = Math.round(TRIAL_DAYS[hireType] / 7);
  return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
};

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}

/* ---------------------------------- dates --------------------------------- */

const DAY_MS = 86400000;

/** Today as YYYY-MM-DD in India, where the team works. */
export const todayIst = () =>
  new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

export const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS)
    .toISOString()
    .slice(0, 10);

export const isDay = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/** "Mon, 3 Nov 2026" for a YYYY-MM-DD day. */
export const formatDay = (day?: string | null) => {
  if (!day || !isDay(day)) return '';
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

/** The trial's last day, counting the first as day 1. */
export const trialEndFor = (start: string, hireType: HIRE_TYPE) =>
  addDays(start, TRIAL_DAYS[hireType] - 1);

/** Which trial day it is (1-based), clamped to the trial. */
export function trialDay(
  startsOn: string | null | undefined,
  endsOn: string | null | undefined,
  today = todayIst(),
) {
  if (!startsOn || !endsOn) return null;
  const total =
    Math.round((Date.parse(endsOn) - Date.parse(startsOn)) / DAY_MS) + 1;
  const day =
    Math.round((Date.parse(today) - Date.parse(startsOn)) / DAY_MS) + 1;
  return { day: Math.min(Math.max(day, 0), total), total, over: day > total };
}

/* -------------------------------- next move ------------------------------- */

export interface NextMove {
  /** Who moves next: the hire, the hiring team, or nobody. */
  who: 'them' | 'you' | 'done' | 'ended';
  /** A short label for cards, e.g. "Send agreements". */
  short: string;
  /** One plain sentence. */
  text: string;
}

/** What a hire is waiting on, and who moves next. */
export function hireNext(
  o: {
    step: ONBOARDING_STEP;
    documents: Array<{
      kind: ONBOARDING_DOC_KIND;
      title: string;
      signature?: unknown;
      countersign?: { name?: string; signature?: unknown } | null;
    }>;
    terms?: unknown;
    autoSendAgreements?: boolean | null;
    withoutAgreements?: boolean | null;
    trialStartsOn?: string | null;
    trialEndsOn?: string | null;
  },
  today = todayIst(),
): NextMove {
  const unsigned = (kinds: ONBOARDING_DOC_KIND[]) =>
    o.documents
      .filter((d) => kinds.includes(d.kind) && !d.signature)
      .map((d) => d.title);
  // Signed by the hire, still waiting for the company's signature.
  const toCountersign = (kinds: ONBOARDING_DOC_KIND[]) =>
    o.documents.filter(
      (d) =>
        kinds.includes(d.kind) &&
        d.signature &&
        d.countersign &&
        !d.countersign.signature,
    );
  const countersignMove = (
    kinds: ONBOARDING_DOC_KIND[],
    opens: string,
  ): NextMove | null => {
    const docs = toCountersign(kinds);
    if (!docs.length || unsigned(kinds).length) return null;
    const who = docs[0].countersign?.name;
    return {
      who: 'you',
      short: 'Countersign',
      text: `They signed. ${who ? `${who} countersigns` : 'Countersign'} the ${listTitles(docs.map((d) => d.title))} to ${opens}.`,
    };
  };
  switch (o.step) {
    case ONBOARDING_STEP.DETAILS:
      if (o.withoutAgreements)
        return o.terms
          ? {
              who: 'them',
              short: 'Filling in details',
              text: 'Waiting for their details form. No agreements: their portal access opens by itself after.',
            }
          : {
              who: 'them',
              short: 'Filling in details',
              text: 'Waiting for their details form. No agreements: fill in the terms and their access opens straight after.',
            };
      return o.terms && o.autoSendAgreements
        ? {
            who: 'them',
            short: 'Filling in details',
            text: 'Waiting for their details form. The agreements go out by themselves after.',
          }
        : {
            who: 'them',
            short: 'Filling in details',
            text: 'Waiting for their details form. Fill in the terms now and the agreements go out straight after.',
          };
    case ONBOARDING_STEP.AGREEMENTS: {
      const sent = o.documents.filter((d) => AGREEMENT_ROUND.includes(d.kind));
      if (!sent.length)
        return o.withoutAgreements
          ? {
              who: 'you',
              short: 'Open access',
              text: 'Their details are in. Fill in the terms to open their portal access (no agreements).',
            }
          : {
              who: 'you',
              short: 'Send agreements',
              text: 'Their details are in. Fill in the terms and pick the documents to send, or none to open access straight away.',
            };
      const counter = countersignMove(
        AGREEMENT_ROUND,
        'open their portal access',
      );
      if (counter) return counter;
      const left = unsigned(AGREEMENT_ROUND);
      return {
        who: 'them',
        short: `Signing ${sent.length - left.length} of ${sent.length}`,
        text: `Waiting for them to sign the ${listTitles(left)}.`,
      };
    }
    case ONBOARDING_STEP.TRIAL: {
      const t = trialDay(o.trialStartsOn, o.trialEndsOn, today);
      if (t?.over || (t && t.day >= t.total))
        return {
          who: 'you',
          short: 'Decide the trial',
          text: 'The trial is over. Confirm it to send the offer, or end it.',
        };
      if (t && t.day < 1)
        return {
          who: 'them',
          short: `Starts ${formatDay(o.trialStartsOn)}`,
          text: `Their trial starts on ${formatDay(o.trialStartsOn)}.`,
        };
      return {
        who: 'them',
        short: `Trial day ${t?.day ?? 1} of ${t?.total ?? '?'}`,
        text: `On trial until ${formatDay(o.trialEndsOn)}. You can confirm it early.`,
      };
    }
    case ONBOARDING_STEP.OFFER: {
      const counter = countersignMove(OFFER_DOCS, 'complete the hire');
      if (counter) return counter;
      const left = unsigned(OFFER_DOCS);
      return {
        who: 'them',
        short: 'Signing the offer',
        text: `Waiting for them to sign the ${listTitles(left)}.`,
      };
    }
    case ONBOARDING_STEP.HIRED:
      return {
        who: 'done',
        short: 'Fully hired',
        text: 'Fully hired. Set up their introductory call.',
      };
    case ONBOARDING_STEP.ENDED:
    default:
      return {
        who: 'ended',
        short: 'Ended',
        text: 'Onboarding ended and their access is closed.',
      };
  }
}
