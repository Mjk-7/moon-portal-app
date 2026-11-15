'use client';

import dayjs from 'dayjs';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

import { Icon } from '../../Admin/shared/AdminUI';
import type { Place } from './sheetParts';
import { PlaceDot } from './sheetParts';

/*
 * "/" on a new line of the day's sheet: a list of the person's upcoming
 * tasks (a later day, or none yet) to search, and picking one brings it to
 * the open day instead of writing it again.
 */

export type UpcomingTask = {
  id: string;
  title: string;
  forDate?: string | null;
  dueDate?: string | null;
};

type Upcoming = {
  tasks: UpcomingTask[];
  placeOf: (t: UpcomingTask) => Place;
  /** The open day, the one a picked task moves to. */
  date: string;
  /** Moves a task to the open day. */
  pull: (t: UpcomingTask) => Promise<void> | void;
};

export const UpcomingContext = createContext<Upcoming | null>(null);

const dayOf = (t: UpcomingTask) =>
  t.forDate || (t.dueDate ? String(t.dueDate).slice(0, 10) : null);

const MAX = 8;

/** Whether a line's words are a "/" search. */
export const isSlash = (text: string) => text.trimStart().startsWith('/');

/**
 * The search for a line's words: its matches, the one picked with the
 * arrow keys, and a key handler that returns true when it used the key.
 */
export function useSlash(text: string, onDone: () => void) {
  const upcoming = useContext(UpcomingContext);
  const open = !!upcoming && isSlash(text);
  const query = open ? text.trimStart().slice(1).trim().toLowerCase() : '';
  const [active, setActive] = useState(0);

  const items = useMemo(() => {
    if (!open || !upcoming) return [];
    const words = query.split(/\s+/).filter(Boolean);
    return upcoming.tasks
      .filter((t) => {
        const hay = `${t.title} ${upcoming.placeOf(t).name}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => (dayOf(a) ?? '9999').localeCompare(dayOf(b) ?? '9999'))
      .slice(0, MAX);
  }, [open, upcoming, query]);

  useEffect(() => setActive(0), [query]);

  const pick = (t: UpcomingTask | undefined) => {
    if (!t || !upcoming) return;
    onDone();
    upcoming.pull(t);
  };

  const onKey = (e: React.KeyboardEvent): boolean => {
    if (!open) return false;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(items.length - 1, i + 1));
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pick(items[active]);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onDone();
      return true;
    }
    return false;
  };

  return { open, items, active, setActive, pick, onKey, upcoming };
}

const when = (t: UpcomingTask) => {
  const d = dayOf(t);
  if (!d) return 'No day';
  const day = dayjs(d);
  if (day.isSame(dayjs().add(1, 'day'), 'day')) return 'Tomorrow';
  return day.format(day.isSame(dayjs(), 'year') ? 'ddd D MMM' : 'D MMM YYYY');
};

/** The list under the line, while its words start with "/". */
export const SlashMenu = ({
  slash,
}: {
  slash: ReturnType<typeof useSlash>;
}) => {
  const { open, items, active, setActive, pick, upcoming } = slash;
  if (!open || !upcoming) return null;
  const target = dayjs(upcoming.date).isSame(dayjs(), 'day')
    ? 'today'
    : dayjs(upcoming.date).format('ddd D MMM');
  return (
    <div
      role="listbox"
      aria-label="Upcoming tasks"
      className="absolute inset-x-0 top-full z-[60] mt-1 overflow-hidden rounded-xl border border-white/10 bg-neutral-900 p-1 shadow-2xl shadow-black/50 auto-light:border-black/10 auto-light:bg-white auto-light:shadow-black/10"
    >
      <p className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
        <Icon name="event_upcoming" className="text-[13px]" />
        Bring an upcoming task to {target}
      </p>
      {items.map((t, i) => {
        const place = upcoming.placeOf(t);
        return (
          <button
            key={t.id}
            type="button"
            role="option"
            aria-selected={i === active}
            // Keeps the line's focus, so its blur doesn't close the list first.
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => pick(t)}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left',
              i === active && 'bg-white/[0.07] auto-light:bg-black/[0.05]',
            )}
          >
            <PlaceDot place={place} />
            <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-100 auto-light:text-neutral-900">
              {t.title}
            </span>
            <span className="hidden max-w-[120px] shrink-0 truncate text-[11px] text-neutral-500 sm:inline">
              {place.kind === 'none' ? '' : place.name}
            </span>
            <span className="w-20 shrink-0 whitespace-nowrap text-right text-[11px] tabular-nums text-neutral-500">
              {when(t)}
            </span>
          </button>
        );
      })}
      {!items.length && (
        <p className="px-2 py-2.5 text-xs text-neutral-500">
          {upcoming.tasks.length
            ? 'No upcoming task matches that.'
            : 'You have no upcoming tasks.'}
        </p>
      )}
      <p className="border-t border-white/[0.06] px-2 pb-1 pt-1.5 text-[10px] text-neutral-600 auto-light:border-black/[0.06] auto-light:text-neutral-400">
        ↑ ↓ to choose · Enter to bring it here · Esc to cancel
      </p>
    </div>
  );
};
