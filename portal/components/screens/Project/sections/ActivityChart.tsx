'use client';

import type { Task } from '@db/client';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef } from 'react';

import { cn } from '@/lib/utils';

/*
 * A year of the project's work as a grid of days, the way GitHub shows
 * contributions: one column a week (Monday on top), each day as dark as
 * the work points logged and tasks finished on it. Picking a day shows
 * that day's tasks below.
 */

const WEEKS = 53;
/** How strong each level is, over the project's color. */
const LEVEL_ALPHA = [0, 0.28, 0.5, 0.75, 1];

/** The Monday of a day's week. */
export const mondayOf = (d: dayjs.Dayjs) =>
  d.subtract((d.day() + 6) % 7, 'day').startOf('day');

const hexToRgb = (hex: string) => {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const ActivityChart = ({
  points,
  tasks,
  color,
  loading,
  from,
  to,
  onPick,
}: {
  points: { date: string; taskId: string }[];
  tasks: Task[];
  color?: string | null;
  loading?: boolean;
  /** The days the tasks below show, marked on the grid. */
  from: string;
  to: string;
  onPick: (day: string) => void;
}) => {
  const scroller = useRef<HTMLDivElement>(null);
  const rgb = hexToRgb(color || '#22c55e') ?? [34, 197, 94];
  const today = dayjs().startOf('day');
  const todayKey = today.format('YYYY-MM-DD');
  const first = mondayOf(today).subtract(WEEKS - 1, 'week');

  const { byDay, totalPoints, totalDone, activeDays } = useMemo(() => {
    const out = new Map<string, { points: number; done: number }>();
    const start = first.format('YYYY-MM-DD');
    let totalPoints = 0;
    let totalDone = 0;
    for (const p of points) {
      if (!p.date || p.date < start) continue;
      const c = out.get(p.date) ?? { points: 0, done: 0 };
      c.points += 1;
      totalPoints += 1;
      out.set(p.date, c);
    }
    for (const t of tasks) {
      if (t.status !== 'DONE' || !t.completedAt) continue;
      const day = dayjs(t.completedAt as unknown as string).format(
        'YYYY-MM-DD',
      );
      if (day < start) continue;
      const c = out.get(day) ?? { points: 0, done: 0 };
      c.done += 1;
      totalDone += 1;
      out.set(day, c);
    }
    return { byDay: out, totalPoints, totalDone, activeDays: out.size };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, tasks, first.valueOf()]);

  // Levels split the busiest day into four steps.
  const max = Math.max(
    1,
    ...Array.from(byDay.values()).map((c) => c.points + c.done),
  );
  const levelOf = (n: number) =>
    n <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((n / max) * 4)));

  const weeks = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => first.add(w * 7 + d, 'day')),
  );

  // Show this week first on small screens.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  return (
    <section className="mb-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 auto-light:border-black/[0.088] auto-light:bg-black/[0.02]">
      <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Activity
        </h3>
        <p className="text-xs text-neutral-400 auto-light:text-neutral-600">
          {loading
            ? 'Loading…'
            : `${plural(totalPoints, 'work point')} and ${plural(totalDone, 'task')} done in the last year, on ${plural(activeDays, 'day')}`}
        </p>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-neutral-500">
          Less
          {LEVEL_ALPHA.map((a, i) => (
            <span
              key={i}
              className={cn(
                'size-[10px] rounded-[3px]',
                i === 0 && 'bg-white/[0.06] auto-light:bg-black/[0.06]',
              )}
              style={
                i ? { backgroundColor: `rgba(${rgb.join(',')},${a})` } : {}
              }
            />
          ))}
          More
        </span>
      </header>
      <div ref={scroller} className="quiet-scrollbar overflow-x-auto pb-1">
        <div className="inline-flex min-w-full gap-[3px]">
          <div className="mr-1 flex flex-col gap-[3px] pt-[16px] text-[9px] leading-[11px] text-neutral-600 auto-light:text-neutral-400">
            {['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((d, i) => (
              <span key={i} className="h-[11px]">
                {d}
              </span>
            ))}
          </div>
          {weeks.map((days, w) => {
            const monthStarts = days.find((d) => d.date() === 1);
            return (
              <div key={w} className="flex flex-col gap-[3px]">
                <span className="h-[13px] whitespace-nowrap text-[9px] leading-[13px] text-neutral-600 auto-light:text-neutral-400">
                  {(w === 0 || monthStarts) && w < WEEKS - 1
                    ? (monthStarts ?? days[0]).format('MMM')
                    : ''}
                </span>
                {days.map((d) => {
                  const key = d.format('YYYY-MM-DD');
                  if (key > todayKey)
                    return <span key={key} className="size-[11px]" />;
                  const c = byDay.get(key);
                  const n = (c?.points ?? 0) + (c?.done ?? 0);
                  const level = levelOf(n);
                  const picked = key >= from && key <= to;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onPick(key)}
                      title={`${d.format('ddd D MMM YYYY')}: ${
                        n
                          ? [
                              c?.points && plural(c.points, 'work point'),
                              c?.done && `${plural(c.done, 'task')} done`,
                            ]
                              .filter(Boolean)
                              .join(', ')
                          : 'nothing logged'
                      }`}
                      className={cn(
                        'size-[11px] rounded-[3px] transition-transform hover:scale-125',
                        level === 0 &&
                          'bg-white/[0.06] auto-light:bg-black/[0.06]',
                        picked &&
                          'ring-1 ring-white/60 ring-offset-0 auto-light:ring-black/75',
                        key === todayKey &&
                          !picked &&
                          'ring-1 ring-white/30 auto-light:ring-black/[0.375]',
                      )}
                      style={
                        level
                          ? {
                              backgroundColor: `rgba(${rgb.join(',')},${LEVEL_ALPHA[level]})`,
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
