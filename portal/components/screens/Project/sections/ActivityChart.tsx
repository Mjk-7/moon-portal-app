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

type ChartPoint = {
  date: string;
  taskId: string;
  userId?: string;
  at?: string;
  text?: string;
};

/**
 * Three plain lines beside the grid: this week against last (up to the same
 * weekday), the streak of days with work, and what is open or overdue.
 */
function statsOf({
  tasks,
  byDay,
  todayKey,
}: {
  tasks: Task[];
  byDay: Map<string, { points: number; done: number }>;
  todayKey: string;
}): { key: string; text: React.ReactNode }[] {
  const today = dayjs(todayKey);
  const monday = mondayOf(today);
  const sinceMon = today.diff(monday, 'day');
  const sum = (from: dayjs.Dayjs) => {
    let p = 0;
    let d = 0;
    for (let i = 0; i <= sinceMon; i++) {
      const c = byDay.get(from.add(i, 'day').format('YYYY-MM-DD'));
      p += c?.points ?? 0;
      d += c?.done ?? 0;
    }
    return { p, d };
  };
  const week = sum(monday);
  const last = sum(monday.subtract(1, 'week'));
  const diff = week.p + week.d - (last.p + last.d);

  // Days in a row with work, up to today (or yesterday, before today's starts).
  let streak = 0;
  let cursor = byDay.get(todayKey) ? today : today.subtract(1, 'day');
  while (byDay.get(cursor.format('YYYY-MM-DD'))) {
    streak += 1;
    cursor = cursor.subtract(1, 'day');
  }

  const open = tasks.filter((t) =>
    ['TODO', 'IN_PROGRESS', 'IN_REVIEW'].includes(t.status),
  );
  const overdue = open.filter((t) => {
    const d = t.forDate ?? (t.dueDate ? String(t.dueDate).slice(0, 10) : null);
    return !!d && d < todayKey;
  }).length;

  return [
    {
      key: 'week',
      text: (
        <>
          <b className="font-medium text-neutral-100 auto-light:text-neutral-900">
            {plural(week.p, 'point')}
          </b>
          ,{' '}
          <b className="font-medium text-neutral-100 auto-light:text-neutral-900">
            {week.d} done
          </b>{' '}
          this week
          {diff !== 0 && (
            <span
              title="Against last week, up to the same day"
              className={cn(
                'ml-1.5 whitespace-nowrap text-[11px]',
                diff > 0
                  ? 'text-emerald-400 auto-light:text-emerald-600'
                  : 'text-rose-300 auto-light:text-rose-600',
              )}
            >
              {diff > 0 ? '▲' : '▼'} {Math.abs(diff)}
            </span>
          )}
        </>
      ),
    },
    {
      key: 'streak',
      text: streak ? (
        <>
          <b className="font-medium text-neutral-100 auto-light:text-neutral-900">
            {plural(streak, 'day')}
          </b>{' '}
          in a row with work
        </>
      ) : (
        'No streak right now'
      ),
    },
    {
      key: 'open',
      text: (
        <>
          <b className="font-medium text-neutral-100 auto-light:text-neutral-900">
            {open.length} open
          </b>
          {overdue > 0 ? (
            <>
              ,{' '}
              <span className="text-rose-300 auto-light:text-rose-600">
                {overdue} overdue
              </span>
            </>
          ) : (
            ', none overdue'
          )}
        </>
      ),
    },
  ];
}

export const ActivityChart = ({
  points,
  tasks,
  color,
  loading,
  from,
  to,
  onPick,
}: {
  points: ChartPoint[];
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

  const stats = useMemo(
    () => statsOf({ tasks, byDay, todayKey }),
    [tasks, byDay, todayKey],
  );

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
                'size-[9px] rounded-[3px]',
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
      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1">
          {/* Outside the scroller, so the days stay in view. */}
          <div className="mr-1 flex shrink-0 flex-col gap-[3px] pt-[16px] text-[9px] leading-[9px] text-neutral-600 auto-light:text-neutral-400">
            {['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((d, i) => (
              <span key={i} className="h-[9px]">
                {d}
              </span>
            ))}
          </div>
          <div
            ref={scroller}
            className="quiet-scrollbar min-w-0 flex-1 overflow-x-auto pb-1"
          >
            <div className="inline-flex min-w-full gap-[3px]">
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
                        return <span key={key} className="size-[9px]" />;
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
                            'size-[9px] rounded-[3px] transition-transform hover:scale-125',
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
        </div>
        <ul className="flex shrink-0 flex-wrap gap-x-6 gap-y-1.5 border-white/[0.07] text-[12.5px] leading-snug text-neutral-400 auto-light:border-black/[0.08] auto-light:text-neutral-600 xl:w-64 xl:flex-col xl:justify-center xl:gap-y-2.5 xl:border-l xl:pl-5">
          {stats.map((s) => (
            <li key={s.key} className="flex items-baseline gap-2">
              <span
                className="size-1.5 shrink-0 -translate-y-px rounded-full"
                style={{ backgroundColor: `rgb(${rgb.join(',')})` }}
              />
              <span>{loading ? '…' : s.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
