/* eslint-disable @next/next/no-img-element */
'use client';

import localFont from 'next/font/local';
import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';

import { APPLY_PAGES, type ApplyPageConfig } from '@/lib/hiring/applyPages';
import {
  FILE_ACCEPT,
  MAX_FILE_BYTES,
  validateAnswers,
  validateApplicant,
} from '@/lib/hiring/forms';
import { FORM_FIELD_TYPE, type FormField } from '@/models/hiring';
import { TMD_PORTAL_API_KEY } from '@/utils/constants/appInfo';

import { scribble, seeded } from '../Task/marker';
import styles from './apply.module.css';
import { PREVIEW_NOT_SENT, type PublicOpening } from './ApplyPage';
import { jobTextBlocks } from './JobText';

// The task pages' fonts, bundled in the repo so builds never fetch them.
const sans = localFont({
  src: '../Task/fonts/PlusJakartaSans-latin.woff2',
  weight: '200 800',
  variable: '--ap-sans',
});
const mono = localFont({
  src: [
    { path: '../Task/fonts/DMMono-400-latin.woff2', weight: '400' },
    { path: '../Task/fonts/DMMono-500-latin.woff2', weight: '500' },
  ],
  variable: '--ap-mono',
});
const hand = localFont({
  src: '../Task/fonts/Caveat-latin.woff2',
  weight: '400 700',
  variable: '--ap-hand',
});

const cx = (...names: Array<string | false | null | undefined>) =>
  names.filter(Boolean).join(' ');

/* --------------------------------- text ---------------------------------- */

const BOLD = /\*\*(\S(?:.*?\S)?)\*\*/;
const LINK = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/;

const withLinks = (text: string): ReactNode[] =>
  text.split(LINK).map((part, i) =>
    i % 2 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow">
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );

const inline = (text: string): ReactNode[] =>
  text
    .split(BOLD)
    .map((part, i) =>
      i % 2 ? (
        <strong key={i}>{withLinks(part)}</strong>
      ) : (
        <Fragment key={i}>{withLinks(part)}</Fragment>
      ),
    );

type Block = ReturnType<typeof jobTextBlocks>[number];
type Section = { heading: string | null; blocks: Block[] };

/** The details, split at each heading. */
const toSections = (text: string | null): Section[] => {
  if (!text) return [];
  const sections: Section[] = [];
  for (const block of jobTextBlocks(text)) {
    if (block.kind === 'heading')
      sections.push({ heading: block.text, blocks: [] });
    else if (sections.length) sections[sections.length - 1].blocks.push(block);
    else sections.push({ heading: null, blocks: [block] });
  }
  return sections.filter((s) => s.blocks.length);
};

const isSteps = (s: Section) =>
  s.blocks.length === 1 &&
  s.blocks[0].kind === 'list' &&
  s.blocks[0].ordered &&
  s.blocks[0].items.length > 1;

const Blocks = ({ blocks }: { blocks: Block[] }) => (
  <>
    {blocks.map((block, i) =>
      block.kind === 'list' ? (
        <ul key={i} className={styles.list}>
          {block.items.map((item, j) => (
            <li key={j}>{inline(item)}</li>
          ))}
        </ul>
      ) : block.kind === 'paragraph' ? (
        <p key={i} className={styles.para}>
          {block.lines.map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {inline(line)}
            </Fragment>
          ))}
        </p>
      ) : null,
    )}
  </>
);

/* -------------------------------- marker --------------------------------- */

/** A word with a red marker loop (or underline) drawn round it. */
const Marked = ({
  children,
  seed,
  shape = 'circle',
  delay = 0,
}: {
  children: ReactNode;
  seed: number;
  shape?: 'circle' | 'under';
  delay?: number;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <span ref={ref} className={styles.marked}>
      {children}
      {box && (
        <svg
          className={styles.markSvg}
          width={box.w}
          height={box.h}
          aria-hidden="true"
        >
          <path
            d={scribble(shape, box.w, box.h, seeded(seed))}
            pathLength={1}
            style={{ animationDelay: `${delay}ms` }}
          />
        </svg>
      )}
    </span>
  );
};

/** A hand-written note with an arrow, in red marker. */
const HandNote = ({
  text,
  className,
  arrow = 'down',
}: {
  text: string;
  className?: string;
  arrow?: 'down' | 'right';
}) => (
  <span className={cx(styles.hand, className)} aria-hidden="true">
    {text}
    <svg
      className={styles.arrow}
      viewBox="0 0 64 48"
      width="64"
      height="48"
      data-dir={arrow}
    >
      <path
        pathLength={1}
        d="M6 6 C 26 4, 46 14, 52 38 M 42 31 L 52 39 L 57 27"
      />
    </svg>
  </span>
);

/* --------------------------------- grain --------------------------------- */

/** Animated paper grain, like the task pages. */
const Grain = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const img = g.createImageData(c.width, c.height);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 80) {
        last = t;
        for (let i = 0; i < img.data.length; i += 4) {
          const v = Math.random() * 255;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
      }
      if (!still) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas
      ref={ref}
      className={styles.grain}
      width={320}
      height={320}
      aria-hidden="true"
    />
  );
};

/* --------------------------------- film ---------------------------------- */

const Film = ({
  opening,
  design,
}: {
  opening: PublicOpening;
  design: ApplyPageConfig;
}) => (
  <figure className={styles.film}>
    <HandNote text={design.notes.video} className={styles.filmNote} />
    <div className={styles.reel}>
      <div className={styles.sprockets} aria-hidden="true" />
      <div className={styles.screen}>
        {opening.showcaseEmbed ? (
          <iframe
            src={opening.showcaseEmbed}
            title={`${opening.company.name} showcase film`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <div className={styles.leader}>
            <span className={styles.rings} aria-hidden="true" />
            <span className={styles.sweep} aria-hidden="true" />
            <div className={styles.leaderText}>
              <b>{design.videoSoon.title}</b>
              <span>{design.videoSoon.body}</span>
            </div>
          </div>
        )}
      </div>
      <div className={styles.sprockets} aria-hidden="true" />
    </div>
    <figcaption className={styles.slate}>
      <span>{opening.company.name}</span>
      <span>{opening.title}</span>
      <span>take 01</span>
    </figcaption>
  </figure>
);

/* --------------------------------- form ---------------------------------- */

type Answers = Record<string, string | string[] | boolean>;

/** A choice with this many options or fewer is drawn as chips. */
const MAX_CHIPS = 8;

const isHalf = (field: FormField) => {
  switch (field.type) {
    case FORM_FIELD_TYPE.SHORT_TEXT:
    case FORM_FIELD_TYPE.EMAIL:
    case FORM_FIELD_TYPE.PHONE:
    case FORM_FIELD_TYPE.URL:
    case FORM_FIELD_TYPE.NUMBER:
    case FORM_FIELD_TYPE.DATE:
      return true;
    case FORM_FIELD_TYPE.SELECT: {
      const options = field.options ?? [];
      return (
        options.length > MAX_CHIPS ||
        (options.length <= 4 && options.join('').length <= 44)
      );
    }
    default:
      return false;
  }
};

const Question = ({
  field,
  value,
  file,
  error,
  onChange,
  onFile,
}: {
  field: FormField;
  value: Answers[string] | undefined;
  file: File | null;
  error?: string;
  onChange: (value: Answers[string]) => void;
  onFile: (file: File | null) => void;
}) => {
  const id = `q-${field.id}`;
  const helpId = field.helpText ? `${id}-help` : undefined;
  const label = (
    <>
      {field.label}
      {field.required && <em aria-hidden="true"> *</em>}
    </>
  );
  const help = field.helpText && (
    <span id={helpId} className={styles.help}>
      {field.helpText}
    </span>
  );
  const err = error && (
    <span className={styles.err} role="alert">
      {error}
    </span>
  );
  const half = isHalf(field);
  const text = typeof value === 'string' ? value : '';

  if (
    (field.type === FORM_FIELD_TYPE.SELECT &&
      (field.options?.length ?? 0) <= MAX_CHIPS) ||
    field.type === FORM_FIELD_TYPE.MULTI_SELECT
  ) {
    const many = field.type === FORM_FIELD_TYPE.MULTI_SELECT;
    const list = Array.isArray(value) ? value : value ? [String(value)] : [];
    return (
      <fieldset
        className={cx(styles.q, half && styles.half)}
        aria-describedby={helpId}
      >
        <legend>{label}</legend>
        {help}
        <div className={styles.chips}>
          {field.options?.map((option) => (
            <label key={option} className={styles.chip}>
              <input
                type={many ? 'checkbox' : 'radio'}
                name={id}
                checked={list.includes(option)}
                onChange={(e) =>
                  onChange(
                    many
                      ? e.target.checked
                        ? [...list, option]
                        : list.filter((o) => o !== option)
                      : option,
                  )
                }
              />
              {option}
            </label>
          ))}
        </div>
        {err}
      </fieldset>
    );
  }

  if (field.type === FORM_FIELD_TYPE.CHECKBOX)
    return (
      <div className={styles.q}>
        <label className={styles.tick} htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            aria-describedby={helpId}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>
            {field.placeholder || field.label}
            {field.required && <em aria-hidden="true"> *</em>}
          </span>
        </label>
        {help}
        {err}
      </div>
    );

  if (field.type === FORM_FIELD_TYPE.FILE)
    return (
      <div className={styles.q}>
        <label htmlFor={id}>{label}</label>
        {help}
        <div className={styles.file}>
          <input
            id={id}
            type="file"
            accept={FILE_ACCEPT}
            aria-describedby={helpId}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <span aria-hidden="true">↑</span>
          <span>
            {file
              ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`
              : `Choose a file (PDF, Word or image, up to ${MAX_FILE_BYTES / 1024 / 1024} MB)`}
          </span>
        </div>
        {err}
      </div>
    );

  if (field.type === FORM_FIELD_TYPE.SELECT)
    return (
      <div className={cx(styles.q, half && styles.half)}>
        <label htmlFor={id}>{label}</label>
        {help}
        <select
          id={id}
          className={cx(styles.input, styles.select)}
          value={text}
          aria-invalid={!!error}
          aria-describedby={helpId}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose one</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {err}
      </div>
    );

  const common = {
    id,
    className: styles.input,
    value: text,
    placeholder: field.placeholder ?? undefined,
    'aria-invalid': !!error,
    'aria-describedby': helpId,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  };
  return (
    <div className={cx(styles.q, half && styles.half)}>
      <label htmlFor={id}>{label}</label>
      {help}
      {field.type === FORM_FIELD_TYPE.LONG_TEXT ? (
        <textarea {...common} rows={3} />
      ) : (
        <input
          {...common}
          type={
            field.type === FORM_FIELD_TYPE.EMAIL
              ? 'email'
              : field.type === FORM_FIELD_TYPE.NUMBER
                ? 'number'
                : field.type === FORM_FIELD_TYPE.DATE
                  ? 'date'
                  : field.type === FORM_FIELD_TYPE.PHONE
                    ? 'tel'
                    : field.type === FORM_FIELD_TYPE.URL
                      ? 'url'
                      : 'text'
          }
          autoComplete={
            field.type === FORM_FIELD_TYPE.PHONE
              ? 'tel'
              : field.type === FORM_FIELD_TYPE.EMAIL
                ? 'email'
                : undefined
          }
        />
      )}
      {err}
    </div>
  );
};

const ApplyForm = ({
  opening,
  design,
  onSent,
}: {
  opening: PublicOpening;
  design: ApplyPageConfig;
  onSent: (who: { name: string; email: string }) => void;
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [answers, setAnswers] = useState<Answers>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [sending, setSending] = useState(false);

  const clearError = (key: string) =>
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    const attached = Object.entries(files)
      .filter(([, f]) => !!f)
      .map(([id]) => id);
    const local = {
      ...validateApplicant({ name, email }).errors,
      ...validateAnswers(opening.fields, answers, { filesPresent: attached })
        .errors,
    };
    for (const [id, file] of Object.entries(files))
      if (file && file.size > MAX_FILE_BYTES)
        local[id] = `Files can be up to ${MAX_FILE_BYTES / 1024 / 1024} MB.`;
    setErrors(local);
    if (Object.keys(local).length) {
      setFormError('Please fix the highlighted answers.');
      return;
    }
    if (opening.preview) {
      setFormError(PREVIEW_NOT_SENT);
      return;
    }

    const body = new FormData();
    // Which share link they came from (?ref=linkedin), for the team's sources.
    const source =
      new URLSearchParams(window.location.search).get('ref') || null;
    body.set(
      'payload',
      JSON.stringify({ name, email, answers, website, source }),
    );
    for (const [id, file] of Object.entries(files))
      if (file) body.set(`file:${id}`, file);

    setSending(true);
    try {
      const res = await fetch(`/api/hiring/apply/${opening.slug}`, {
        method: 'POST',
        headers: { tmd_portal_api_key: TMD_PORTAL_API_KEY },
        body,
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok) {
        onSent({ name, email });
        return;
      }
      if (result?.errors) setErrors(result.errors);
      setFormError(
        result?.error ||
          (res.status === 413
            ? 'Your files are too large. Try a smaller file.'
            : 'Something went wrong. Please try again.'),
      );
    } catch {
      setFormError('We could not reach the server. Check your connection.');
    } finally {
      setSending(false);
    }
  };

  const basic = (
    key: 'name' | 'email',
    label: string,
    value: string,
    set: (v: string) => void,
  ) => (
    <div className={cx(styles.q, styles.half)}>
      <label htmlFor={`q-${key}`}>
        {label}
        <em aria-hidden="true"> *</em>
      </label>
      <input
        id={`q-${key}`}
        className={styles.input}
        type={key === 'email' ? 'email' : 'text'}
        autoComplete={key}
        value={value}
        aria-invalid={!!errors[key]}
        onChange={(e) => {
          set(e.target.value);
          clearError(key);
        }}
      />
      {errors[key] && (
        <span className={styles.err} role="alert">
          {errors[key]}
        </span>
      )}
    </div>
  );

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {basic('name', 'Full name', name, setName)}
      {basic('email', 'Email', email, setEmail)}
      {opening.fields.map((field) => (
        <Question
          key={field.id}
          field={field}
          value={answers[field.id]}
          file={files[field.id] ?? null}
          error={errors[field.id]}
          onChange={(value) => {
            setAnswers((a) => ({ ...a, [field.id]: value }));
            clearError(field.id);
          }}
          onFile={(file) => {
            setFiles((f) => ({ ...f, [field.id]: file }));
            clearError(field.id);
          }}
        />
      ))}

      {/* Left empty by people; see the apply API. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className={styles.trap}
      />

      {formError && (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      )}
      <button type="submit" className={styles.send} disabled={sending}>
        {sending ? 'Sending…' : design.form.submit}
        <span aria-hidden="true">→</span>
      </button>
    </form>
  );
};

/* --------------------------------- page ---------------------------------- */

export const DesignedApplyPage = ({ opening }: { opening: PublicOpening }) => {
  const design = APPLY_PAGES[opening.applyPage ?? ''];
  const [sent, setSent] = useState<{ name: string; email: string } | null>(
    null,
  );
  if (!design) return null;

  const paragraphs = (opening.description ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const headline = paragraphs[0] ?? opening.title;
  const rest = paragraphs.slice(1);

  const sections = toSections(opening.details);
  const steps = sections.find(isSteps) ?? null;
  const spotKey = design.spotlight?.toLowerCase();
  const isSpot = (s: Section) =>
    !!spotKey && !!s.heading?.toLowerCase().startsWith(spotKey);
  const cards = sections.filter((s) => s !== steps);
  // Plain cards flow two or three to a row; a last one alone fills its row.
  const plain = cards.filter((s) => !isSpot(s));
  const lastPlain = plain[plain.length - 1];
  const title = design.form.title;
  const titleEnd = /[.?!]$/.test(title) ? title.slice(-1) : '';

  const facts = [
    opening.location,
    opening.employmentType,
    opening.department,
  ].filter(Boolean) as string[];

  let markSeed = 7;
  const firstName = sent?.name.trim().split(/\s+/)[0] || 'there';

  return (
    <div
      className={cx(styles.root, sans.variable, mono.variable, hand.variable)}
    >
      <Grain />
      <header className={styles.top}>
        <span>{opening.company.name.toLowerCase()}</span>
        <span>
          {opening.preview && 'preview · '}
          {opening.title.toLowerCase()}
        </span>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.intro}>
            <p className={styles.kicker}>
              <i aria-hidden="true" />
              {design.kicker} · {opening.title}
            </p>
            <h1 className={styles.headline}>
              {headline.split(BOLD).map((part, i) =>
                i % 2 ? (
                  <Marked key={i} seed={(markSeed += 13)} delay={500}>
                    {part}
                  </Marked>
                ) : (
                  <Fragment key={i}>{part}</Fragment>
                ),
              )}
            </h1>
          </div>
          <Film opening={opening} design={design} />
          <div className={styles.more}>
            {rest.map((p, i) => (
              <p key={i} className={styles.summary}>
                {inline(p)}
              </p>
            ))}
            {facts.length > 0 && (
              <ul className={styles.facts}>
                {facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            )}
            <a href="#apply" className={styles.cta}>
              Apply now <span aria-hidden="true">↓</span>
            </a>
          </div>
        </section>

        {cards.length > 0 && (
          <section className={styles.cards} aria-label="About the role">
            {cards.map((s, i) => (
              <article
                key={i}
                className={cx(styles.card, isSpot(s) && styles.spot)}
                data-lone-of-2={
                  s === lastPlain && plain.length % 2 === 1 ? '' : undefined
                }
                data-lone-of-3={
                  s === lastPlain && plain.length % 3 === 1 ? '' : undefined
                }
              >
                <i aria-hidden="true" />
                <i aria-hidden="true" />
                <i aria-hidden="true" />
                <i aria-hidden="true" />
                <span className={styles.num}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                {s.heading && <h2>{s.heading}</h2>}
                <div className={styles.cardBody}>
                  <Blocks blocks={s.blocks} />
                </div>
              </article>
            ))}
          </section>
        )}

        {steps && steps.blocks[0].kind === 'list' && (
          <section className={styles.steps}>
            {steps.heading && <h2>{steps.heading}</h2>}
            <ol>
              {steps.blocks[0].items.map((item, i) => (
                <li
                  key={i}
                  className={cx(
                    !!spotKey &&
                      item.toLowerCase().startsWith(spotKey) &&
                      styles.stepSpot,
                  )}
                >
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  {inline(item)}
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className={styles.apply} id="apply">
          <div className={styles.applyHead}>
            <h2>
              {titleEnd ? title.slice(0, -1) : title}
              {titleEnd && <span>{titleEnd}</span>}
            </h2>
            <HandNote
              text={design.notes.form}
              arrow="right"
              className={styles.formNote}
            />
          </div>
          {sent ? (
            <div className={styles.sent} role="status">
              <h3>{design.form.sentTitle}</h3>
              <p>
                {design.form.sentBody
                  .replace('{firstName}', firstName)
                  .replace('{email}', sent.email)}
              </p>
            </div>
          ) : !opening.isOpen ? (
            <div className={styles.sent}>
              <h3>Applications are closed.</h3>
              <p>This opening is no longer taking applications.</p>
            </div>
          ) : (
            <ApplyForm
              opening={opening}
              design={design}
              onSent={(who) => {
                setSent(who);
                document
                  .getElementById('apply')
                  ?.scrollIntoView({ behavior: 'smooth' });
              }}
            />
          )}
        </section>
      </main>

      <footer className={styles.foot}>
        <span>
          {opening.title} · {opening.company.name}
        </span>
        <span>
          <img src="/brand/portal-logo.svg" alt="" />
          Applications are handled in The Moon Devs portal.
        </span>
      </footer>
    </div>
  );
};
