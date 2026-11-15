'use client';

import {
  forwardRef,
  Fragment,
  type RefObject,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

import { prefersReducedMotion, scribble, seeded } from './marker';
import styles from './task.module.css';

export { prefersReducedMotion, scribble, seeded };

/*
 * The sketchbook's tools: scroll-driven frames, text that types itself in as
 * you scroll, and red marker strokes that draw around words.
 */

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/** Sets a path's dash so `draw(path, k)` reveals k of it, 0 to 1. */
export function primeStroke(path: SVGPathElement) {
  const length = path.getTotalLength();
  path.style.strokeDasharray = `${length}`;
  path.dataset.len = `${length}`;
  path.style.strokeDashoffset = `${length}`;
}
export function drawStroke(path: SVGPathElement | null, k: number) {
  if (!path?.dataset.len) return;
  path.style.strokeDashoffset = `${Number(path.dataset.len) * (1 - clamp(k))}`;
}

/** How far a tall section has scrolled past its pinned screen, 0 to 1. */
export const progressOf = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect();
  return clamp(-rect.top / Math.max(1, rect.height - window.innerHeight));
};

/**
 * Calls `frame(progress, time)` every animation frame while the section is
 * near the screen. With reduced motion it still runs, and scenes jump to
 * their finished state instead of animating.
 */
export function useScrollFrame(
  ref: RefObject<HTMLElement>,
  frame: (progress: number, time: number) => void,
) {
  const frameRef = useRef(frame);
  frameRef.current = frame;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let visible = true;
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !raf) raf = requestAnimationFrame(loop);
      },
      { rootMargin: '50% 0px' },
    );
    const loop = (t: number) => {
      raf = 0;
      if (!visible) return;
      frameRef.current(progressOf(el), t);
      raf = requestAnimationFrame(loop);
    };
    io.observe(el);
    raf = requestAnimationFrame(loop);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [ref]);
}

export type Segment = { text: string; mark?: 'circle' | 'under' | 'strike' };

export interface TypedHandle {
  /** Shows the first k (0 to 1) of the text, with a caret after it. */
  type: (k: number) => void;
  /** Draws the i-th marked words' stroke, k from 0 to 1. */
  mark: (i: number, k: number) => void;
}

/**
 * Text split into characters that stay in the layout while hidden, so the
 * marker strokes around words can be measured before they are typed.
 */
export const Typed = forwardRef<
  TypedHandle,
  {
    as?: 'p' | 'h2' | 'span';
    className?: string;
    segments: Segment[];
    seed?: number;
  }
>(function Typed({ as: Tag = 'p', className, segments, seed = 7 }, ref) {
  const root = useRef<HTMLElement>(null);
  const caret = useRef<HTMLElement>(null);
  const shown = useRef(-1);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const rand = seeded(seed);
    const place = () =>
      el.querySelectorAll<HTMLElement>(`.${styles.mark}`).forEach((mark) => {
        const svg = mark.querySelector('svg');
        const path = svg?.querySelector('path');
        if (!svg || !path) return;
        const w = mark.offsetWidth;
        const h = mark.offsetHeight;
        svg.setAttribute('width', `${w}`);
        svg.setAttribute('height', `${h}`);
        const k = path.dataset.len
          ? 1 -
            Number(path.style.strokeDashoffset || 0) / Number(path.dataset.len)
          : 0;
        path.setAttribute(
          'd',
          scribble(
            mark.dataset.shape as 'circle' | 'under' | 'strike',
            w,
            h,
            rand,
          ),
        );
        primeStroke(path);
        drawStroke(path, k);
      });
    place();
    window.addEventListener('resize', place);
    document.fonts?.ready.then(place);
    return () => window.removeEventListener('resize', place);
  }, [seed]);

  useImperativeHandle(ref, () => ({
    type: (k) => {
      const el = root.current;
      if (!el) return;
      const chars = el.querySelectorAll<HTMLElement>(`.${styles.ch}`);
      const n = Math.round(clamp(k) * chars.length);
      if (n === shown.current) return;
      shown.current = n;
      chars.forEach((c, i) => {
        if (i < n) c.removeAttribute('data-hidden');
        else c.setAttribute('data-hidden', '');
      });
      const c = caret.current;
      const last = chars[Math.max(0, n - 1)];
      if (!c) return;
      c.style.display = n > 0 && n < chars.length ? 'block' : 'none';
      if (last) {
        // Offsets are relative to the nearest positioned box, the root.
        const box = el.getBoundingClientRect();
        const r = last.getBoundingClientRect();
        c.style.left = `${r.right - box.left + 2}px`;
        c.style.top = `${r.top - box.top}px`;
        c.style.height = `${r.height}px`;
      }
    },
    mark: (i, k) =>
      drawStroke(
        root.current?.querySelectorAll<SVGPathElement>(`.${styles.mark} path`)[
          i
        ] ?? null,
        k,
      ),
  }));

  const chars = (text: string, key: string) =>
    Array.from(text).map((ch, i) => (
      <span key={`${key}-${i}`} className={styles.ch} data-hidden="">
        {ch}
      </span>
    ));

  return (
    <Tag
      ref={root as never}
      className={className}
      aria-label={segments.map((s) => s.text).join('')}
    >
      {segments.map((seg, i) =>
        seg.mark ? (
          <span
            key={i}
            className={styles.mark}
            data-shape={seg.mark}
            aria-hidden="true"
          >
            {chars(seg.text, `${i}`)}
            <svg>
              <path />
            </svg>
          </span>
        ) : (
          <Fragment key={i}>
            <span aria-hidden="true">{chars(seg.text, `${i}`)}</span>
          </Fragment>
        ),
      )}
      <i ref={caret} className={styles.caret} aria-hidden="true" />
    </Tag>
  );
});
