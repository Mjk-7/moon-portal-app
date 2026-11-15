'use client';

import type { Task } from '@db/client';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef } from 'react';

import { cn } from '@/lib/utils';

import { Icon } from '../../Admin/shared/AdminUI';

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

type Stat = {
  icon: string;
  label: string;
  value: React.ReactNode;
  /** A small line under the value. */
  note?: React.ReactNode;
  tone?: string;
};

const ago = (at: string) => {
  const mins = dayjs().diff(dayjs(at), 'minute');
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return dayjs(at).format('D MMM');
};

const WEEKDAYS = [
  'Sundays',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
];

/**
 * The few numbers worth knowing about the project's pace, shown beside the
 * grid: this week against last, the streak, open and overdue work, who has
 * logged most this month, the busiest weekday and the latest work.
 */
function statsOf({
  points,
  tasks,
  byDay,
  todayKey,
  nameOf,
}: {
  points: ChartPoint[];
  tasks: Task[];
  byDay: Map<string, { points: number; done: number }>;
  todayKey: string;
  nameOf: (id: string) => string | undefined;
}): Stat[] {
  const today = dayjs(todayKey);
  const monday = mondayOf(today);
  const sinceMon = today.diff(monday, 'day');
  const lastMon = monday.subtract(1, 'week');
  const sum = (from: dayjs.Dayjs, days: number) => {
    let p = 0;
    let d = 0;
    for (let i = 0; i <= days; i++) {
      const c = byDay.get(from.add(i, 'day').format('YYYY-MM-DD'));
      p += c?.points ?? 0;
      d += c?.done ?? 0;
    }
    return { p, d };
  };
  const week = sum(monday, sinceMon);
  const last = sum(lastMon, sinceMon);
  const diff = week.p + week.d - (last.p + last.d);

  // Days in a row with work, up to today (or yesterday, before today's starts).
  let streak = 0;
  let cursor = byDay.get(todayKey) ? today : today.subtract(1, 'day');
  while (byDay.get(cursor.format('YYYY-MM-DD'))) {
    streak += 1;
    cursor = cursor.subtract(1, 'day');
  }
  let longest = 0;
  let run = 0;
  const keys = Array.from(byDay.keys()).sort();
  let prev: string | null = null;
  for (const k of keys) {
    run = prev && dayjs(k).diff(dayjs(prev), 'day') === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = k;
  }

  const open = tasks.filter((t) =>
    ['TODO', 'IN_PROGRESS', 'IN_REVIEW'].includes(t.status),
  );
  const overdue = open.filter((t) => {
    const d = t.forDate ?? (t.dueDate ? String(t.dueDate).slice(0, 10) : null);
    return !!d && d < todayKey;
  });
  const underWay = open.filter((t) => t.status !== 'TODO').length;

  const monthStart = today.startOf('month').format('YYYY-MM-DD');
  const byPerson = new Map<string, number>();
  for (const p of points)
    if (p.userId && p.date >= monthStart)
      byPerson.set(p.userId, (byPerson.get(p.userId) ?? 0) + 1);
  const top = Array.from(byPerson.entries()).sort((a, b) => b[1] - a[1])[0];

  const weekday = new Array(7).fill(0);
  for (const [k, c] of Array.from(byDay.entries()))
    weekday[dayjs(k).day()] += c.points + c.done;
  const busiest = weekday.indexOf(Math.max(...weekday));

  const latest = points
    .filter((p) => p.at)
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0];

  const out: Stat[] = [
    {
      icon: 'date_range',
      label: 'This week',
      value: `${plural(week.p, 'point')} · ${week.d} done`,
      note:
        last.p + last.d > 0 || week.p + week.d > 0 ? (
          <span
            className={cn(
              diff > 0
                ? 'text-emerald-400 auto-light:text-emerald-600'
                : diff < 0
                  ? 'text-rose-300 auto-light:text-rose-600'
                  : undefined,
            )}
          >
            {diff > 0 ? '▲' : diff < 0 ? '▼' : '='} {Math.abs(diff)} vs last
            week
          </span>
        ) : (
          'Nothing logged yet this week'
        ),
    },
    {
      icon: 'local_fire_department',
      label: 'Streak',
      value: streak
        ? `${plural(streak, 'day')} in a row${longest > streak ? ` · best ${longest}` : ''}`
        : longest
          ? `None right now · best ${plural(longest, 'day')}`
          : 'No streak yet',
      tone:
        streak >= 3 ? 'text-amber-300 auto-light:text-amber-600' : undefined,
    },
    {
      icon: 'radio_button_unchecked',
      label: 'Open',
      value: (
        <>
          {open.length} open
          {overdue.length > 0 && (
            <span className="text-rose-300 auto-light:text-rose-600">
              {' '}
              · {overdue.length} overdue
            </span>
          )}
        </>
      ),
      note: underWay ? `${underWay} under way` : 'Nothing under way',
    },
  ];
  if (top)
    out.push({
      icon: 'military_tech',
      label: `Top in ${today.format('MMMM')}`,
      value: `${nameOf(top[0])?.split(' ')[0] ?? 'Someone'} · ${plural(top[1], 'point')}`,
    });
  if (Math.max(...weekday) > 0)
    out.push({
      icon: 'insights',
      label: 'Busiest on',
      value: WEEKDAYS[busiest],
    });
  out.push({
    icon: 'history',
    label: 'Last work',
    value: latest?.at
      ? `${ago(latest.at)}${latest.userId && nameOf(latest.userId) ? ` · ${nameOf(latest.userId)!.split(' ')[0]}` : ''}`
      : 'Nothing logged yet',
  });
  return out;
}

export const ActivityChart = ({
  points,
  tasks,
  users = [],
  color,
  loading,
  from,
  to,
  onPick,
}: {
  points: ChartPoint[];
  tasks: Task[];
  /** Names for the people in the stats. */
  users?: { id: string; name?: string | null }[];
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
    () =>
      statsOf({
        points,
        tasks,
        byDay,
        todayKey,
        nameOf: (id) => users.find((u) => u.id === id)?.name ?? undefined,
      }),
    [points, tasks, byDay, todayKey, users],
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
        <ul className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-2.5 border-white/[0.07] auto-light:border-black/[0.08] sm:grid-cols-3 xl:w-[21rem] xl:grid-cols-2 xl:content-start xl:gap-y-3 xl:border-l xl:pl-4">
          {stats.map((s) => (
            <li key={s.label} className="flex min-w-0 items-start gap-2">
              <Icon
                name={s.icon}
                className="mt-px text-[15px] text-neutral-500"
              />
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                  {s.label}
                </p>
                <p
                  className={cn(
                    'text-[12.5px] leading-snug text-neutral-200 auto-light:text-neutral-800',
                    s.tone,
                  )}
                >
                  {loading ? '…' : s.value}
                </p>
                {s.note && !loading && (
                  <p className="text-[11px] leading-snug text-neutral-500">
                    {s.note}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
