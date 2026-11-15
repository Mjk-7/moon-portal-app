/*
 * Red marker strokes, kept apart from the sketchbook's components so pages
 * that only draw a circle or an underline don't load the task page styles.
 */

/** A seeded random source, so the server and the browser draw the same. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A hand-drawn loop around a w×h box, a double underline beneath it, or a
 * double line struck through it.
 */
export function scribble(
  shape: 'circle' | 'under' | 'strike',
  w: number,
  h: number,
  rand: () => number,
) {
  const r = (a: number, b: number) => a + rand() * (b - a);
  if (shape === 'strike') {
    const y = h * 0.56;
    return `M-6 ${y + r(-3, 1)} C ${w * 0.35} ${y + r(-4, 2)}, ${w * 0.65} ${y + r(-2, 4)}, ${w + 6} ${y + r(-3, 1)} M ${w * 0.04} ${y + r(4, 8)} Q ${w * 0.5} ${y + r(0, 6)} ${w + 2} ${y + r(2, 7)}`;
  }
  if (shape === 'under') {
    // An inline box is taller than its line; the baseline sits about here.
    const y = h * 0.84;
    return `M-4 ${y + r(-2, 2)} C ${w * 0.3} ${y + r(2, 6)}, ${w * 0.6} ${y + r(-4, 0)}, ${w + 6} ${y + r(-2, 3)} M ${w * 0.1} ${y + 8} Q ${w * 0.5} ${y + r(4, 10)} ${w * 0.95} ${y + 6}`;
  }
  const cx = w / 2;
  const cy = h / 2 + h * 0.06;
  const rx = w / 2 + 16;
  const ry = h / 2 + 2;
  let d = '';
  for (let i = 0; i <= 44; i += 1) {
    const a = -2.2 + (i / 40) * Math.PI * 2.15;
    const k = 1 + r(-0.04, 0.04) + i * 0.002;
    d += `${i ? ' L ' : 'M '}${(cx + Math.cos(a) * rx * k).toFixed(1)} ${(cy + Math.sin(a) * ry * k).toFixed(1)}`;
  }
  return d;
}
