/*
 * The issues go to a public GitHub repo, so everything the cat writes there
 * is scrubbed twice: Claude is told to keep people and companies out, and
 * then these patterns catch what slipped through.
 */

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// 7+ digits with optional spaces, dashes, dots or a leading +.
const PHONE = /(?<![\w/])\+?\d[\d\s().-]{6,}\d(?![\w/])/g;
const TOKENISH =
  /\b(?:sk|pk|ghp|gho|github_pat|xox[abprs])[-_][A-Za-z0-9_-]{8,}\b/g;
const LONG_HEX = /\b[a-f0-9]{24,}\b/gi;
const QUERY =
  /([?&][\w-]*(?:token|key|code|secret|password|sig)[\w-]*=)[^&\s)]+/gi;

export function scrub(
  text: string,
  words: { people: string[]; companies: string[] } = {
    people: [],
    companies: [],
  },
) {
  let out = text
    .replace(EMAIL, '[email]')
    .replace(TOKENISH, '[secret]')
    .replace(QUERY, '$1[hidden]')
    .replace(LONG_HEX, '[id]')
    // Dates and amounts are fine; 9+ digits look like a phone or account.
    .replace(PHONE, (match) =>
      match.replace(/\D/g, '').length >= 9 ? '[number]' : match,
    );
  // Longest first, so "Asha Rao" goes before "Asha".
  const byLength = (a: string, b: string) => b.length - a.length;
  // Names as written ("Mark", not "mark as done"); Claude was told to leave
  // them out anyway.
  for (const name of [...words.people].sort(byLength))
    out = out.replace(new RegExp(`\\b${escape(name)}\\b`, 'g'), 'a teammate');
  // Company names as written: "ZONE" yes, "time zone" no.
  for (const name of [...words.companies].sort(byLength))
    out = out.replace(new RegExp(`\\b${escape(name)}\\b`, 'g'), 'a company');
  return out.replace(/a teammate(\s+a teammate)+/g, 'a teammate');
}
