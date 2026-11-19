'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

import { Icon } from '../../Admin/shared/AdminUI';
import type { PickerOption } from './Picker';
import { Picker } from './Picker';
import type { Place } from './sheetParts';
import {
  LineInput,
  placeInput,
  placeOf,
  placeOptions,
  rowStatus,
} from './sheetParts';
import type { Day, DayTask, PlaceInput } from './useDay';

/*
 * The worklog's Plan mode: the day as a plain checklist, one task per line
 * with a check in front and nothing else. Lines are written like a note
 * (Enter for the next, Backspace on an empty one to take it out), and lines
 * or blocks of them are moved by cutting and pasting, Alt+arrows or
 * dragging. The order is saved for the day and comes back when the plan is
 * opened again; tasks that left the day are skipped.
 *
 * With project tags on, each line reads "Project - task", and typing a
 * project's name and " - " in front of a task puts it there.
 */

/** A row's key while the page is open: a new row keeps its first id. */
const keyOf = (t: DayTask) => t.rowKey ?? t.id;

/** Moves `keys` (kept in their order) before or after `target`. */
function moveKeys(
  list: string[],
  keys: string[],
  target: string,
  where: 'before' | 'after',
): string[] {
  if (keys.includes(target)) return list;
  const moving = list.filter((k) => keys.includes(k));
  const rest = list.filter((k) => !keys.includes(k));
  const at = rest.indexOf(target);
  if (at < 0) return list;
  const index = where === 'before' ? at : at + 1;
  return [...rest.slice(0, index), ...moving, ...rest.slice(index)];
}

/** Puts `keys` in after `anchor` (or at the end), out of where they were. */
function insertAfter(list: string[], keys: string[], anchor: string | null) {
  const rest = list.filter((k) => !keys.includes(k));
  const at = anchor ? rest.indexOf(anchor) : -1;
  if (at < 0) return [...rest, ...keys];
  return [...rest.slice(0, at + 1), ...keys, ...rest.slice(at + 1)];
}

/** A pasted line as a task: list marks and checkboxes taken off. */
const cleanLine = (line: string) =>
  line
    .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, '')
    .replace(/^\s*\[[ xX✓]?\]\s*/, '')
    .replace(/^\s*[✓✔✅☐☑]\s*/, '')
    .trim();

type Clip = {
  /** Cut lines move where they are pasted; copied lines are made again. */
  mode: 'cut' | 'copy';
  keys: string[];
  /** What went on the clipboard, to know a paste is ours. */
  text: string;
};

export const PlanSheet = ({
  day,
  shown,
  editable,
  tagged,
  newPlace,
}: {
  day: Day;
  /** The day's tasks under the picked company tab. */
  shown: DayTask[];
  editable: boolean;
  /** Each line reads "Project - task". */
  tagged: boolean;
  /** Where a new line goes when nothing else says (the picked company). */
  newPlace: PlaceInput | null;
}) => {
  // The order as keys; new rows are put in it as they are made.
  const [order, setOrder] = useState<string[]>(day.planOrder);
  const dirty = useRef(false);
  useEffect(() => {
    dirty.current = false;
    setOrder(day.planOrder);
    // Only when another day (or its saved order) is read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.date, day.loading]);

  // Every task of the day in plan order: placed ones first, as placed, then
  // the rest as the day has them.
  const sorted = useMemo(() => {
    const pos = new Map(order.map((k, i) => [k, i] as const));
    const rank = (t: DayTask) =>
      pos.get(t.id) ?? (t.rowKey ? pos.get(t.rowKey) : undefined);
    return day.tasks
      .map((t, i) => ({ t, i, p: rank(t) }))
      .sort((a, b) => {
        if (a.p !== undefined && b.p !== undefined) return a.p - b.p;
        if (a.p !== undefined) return -1;
        if (b.p !== undefined) return 1;
        return a.i - b.i;
      })
      .map((x) => x.t);
  }, [day.tasks, order]);
  const fullKeys = useMemo(() => sorted.map(keyOf), [sorted]);

  const shownKeys = useMemo(() => new Set(shown.map(keyOf)), [shown]);
  const lines = useMemo(
    () => sorted.filter((t) => shownKeys.has(keyOf(t))),
    [sorted, shownKeys],
  );
  const lineKeys = useMemo(() => lines.map(keyOf), [lines]);

  // Saved a moment after a change, once new rows have their ids.
  const savedIds = useMemo(
    () => sorted.filter((t) => !t.draft).map((t) => t.id),
    [sorted],
  );
  const saveRef = useRef(day.saveOrder);
  saveRef.current = day.saveOrder;
  const lastSaved = useRef<string>('');
  useEffect(() => {
    if (!dirty.current || !editable) return;
    const sig = savedIds.join(',');
    if (sig === lastSaved.current) return;
    const timer = setTimeout(() => {
      lastSaved.current = sig;
      saveRef.current(savedIds);
    }, 500);
    return () => clearTimeout(timer);
  }, [savedIds, editable]);

  /** A new order of the full day. */
  const commit = useCallback((next: string[]) => {
    dirty.current = true;
    setOrder(next);
  }, []);

  /** A new order of the lines shown, put back among the hidden ones. */
  const commitShown = useCallback(
    (nextShown: string[]) => {
      const set = new Set(nextShown);
      let j = 0;
      commit(fullKeys.map((k) => (set.has(k) ? nextShown[j++] : k)));
    },
    [commit, fullKeys],
  );

  /* ------------------------------------------------------------------ */

  const inputs = useRef(new Map<string, HTMLTextAreaElement | null>());
  const container = useRef<HTMLDivElement | null>(null);
  const focusLine = useCallback((key: string, caret: 'start' | 'end') => {
    // A new row is on the page a moment later.
    requestAnimationFrame(() => {
      const el = inputs.current.get(key);
      if (!el) return;
      el.focus();
      const at = caret === 'start' ? 0 : el.value.length;
      el.setSelectionRange(at, at);
    });
  }, []);

  // Lines picked as a block: from one line to another.
  const [block, setBlock] = useState<{ anchor: string; head: string } | null>(
    null,
  );
  const picked = useMemo(() => {
    if (!block) return [] as string[];
    const a = lineKeys.indexOf(block.anchor);
    const b = lineKeys.indexOf(block.head);
    if (a < 0 || b < 0) return [];
    return lineKeys.slice(Math.min(a, b), Math.max(a, b) + 1);
  }, [block, lineKeys]);
  useEffect(() => {
    if (block && !picked.length) setBlock(null);
  }, [block, picked]);
  const pickBlock = (anchor: string, head: string) => {
    setBlock({ anchor, head });
    container.current?.focus({ preventScroll: true });
  };

  const [clip, setClip] = useState<Clip | null>(null);
  const cutKeys = clip?.mode === 'cut' ? clip.keys : [];

  const byKey = useMemo(
    () => new Map(sorted.map((t) => [keyOf(t), t] as const)),
    [sorted],
  );
  const options = useMemo(
    () => placeOptions(day.projects, day.companies),
    [day.projects, day.companies],
  );
  const placeOfTask = (t: DayTask): Place =>
    placeOf(t, day.projects, day.companies);

  /** A line's words for the clipboard, as a Markdown checklist line. */
  const lineText = (t: DayTask) => {
    const done = rowStatus(t, day.points, day.date) === 'done';
    const place = placeOfTask(t);
    const tag = tagged && place.kind !== 'none' ? `${place.name} - ` : '';
    return `- [${done ? 'x' : ' '}] ${tag}${t.title.trim()}`;
  };

  /** A project named in front of a task ("PORTAL - fix login"). */
  const taggedPlace = (
    text: string,
  ): { place: PlaceInput; title: string } | null => {
    const m = text.match(/^\s*(.+?)\s+[-–]\s+(\S.*)$/);
    if (!m) return null;
    const name = m[1].trim().toLowerCase();
    const option =
      options.find(
        (o) => o.label.toLowerCase() === name && o.id.startsWith('project:'),
      ) ?? options.find((o) => o.label.toLowerCase() === name);
    if (!option || option.id === 'none') return null;
    return { place: placeInput(option), title: m[2] };
  };

  const putIn = (t: DayTask, place: PlaceInput) => {
    if (t.draft) day.placeDraft(t.id, place);
    else day.place(t.id, place);
  };

  /** Where a line under `t` goes: its project when tagged, else the tab's. */
  const placeUnder = (t?: DayTask): PlaceInput | null => {
    if (tagged && t) {
      const place = placeOfTask(t);
      if (place.kind === 'project') return { projectId: place.key.slice(8) };
      if (place.kind === 'personal') return { personal: true };
    }
    return newPlace;
  };

  const newLineAfter = (t?: DayTask) => {
    const id = day.addDraft(t ? t.id : null, placeUnder(t));
    commit(insertAfter(fullKeys, [id], t ? keyOf(t) : null));
    focusLine(id, 'start');
  };

  /* ------------------------------------------------------------------ */

  const toClipboard = (text: string) =>
    navigator.clipboard?.writeText(text).catch(() => undefined);

  const copyLines = (keys: string[], mode: 'cut' | 'copy') => {
    const tasks = keys
      .map((k) => byKey.get(k))
      .filter((t): t is DayTask => !!t && !!t.title.trim());
    if (!tasks.length) return '';
    const text = tasks.map(lineText).join('\n');
    setClip({ mode, keys: tasks.map(keyOf), text });
    if (mode === 'cut')
      toast(
        `Cut ${tasks.length} line${tasks.length === 1 ? '' : 's'}. Paste where they go; Esc puts them back.`,
      );
    return text;
  };

  /**
   * Pastes after a line: cut lines move there, copied ones are made again,
   * and lines from elsewhere become new tasks. An empty line pasted on
   * makes way for them.
   */
  const pasteAt = async (t: DayTask | undefined, text: string) => {
    if (!editable) return;
    const empty = t && !t.title.trim();
    const anchorIndex = t ? lineKeys.indexOf(keyOf(t)) : lineKeys.length;
    const before = empty ? lines[anchorIndex - 1] : t;
    const anchorKey = before ? keyOf(before) : null;
    const ours = clip && clip.text.trim() === text.trim();

    if (ours && clip.mode === 'cut') {
      const keys = clip.keys.filter((k) => byKey.has(k));
      setClip(null);
      if (empty && t) day.remove(t.id);
      if (anchorKey && keys.includes(anchorKey)) return;
      commit(insertAfter(fullKeys, keys, anchorKey));
      setBlock(keys.length ? { anchor: keys[0], head: keys.at(-1)! } : null);
      container.current?.focus({ preventScroll: true });
      return;
    }

    const items = ours
      ? clip.keys
          .map((k) => byKey.get(k))
          .filter((x): x is DayTask => !!x)
          .map((x) => {
            const place = placeOfTask(x);
            return {
              title: x.title,
              place:
                place.kind === 'project'
                  ? ({ projectId: place.key.slice(8) } as PlaceInput)
                  : place.kind === 'personal'
                    ? ({ personal: true } as PlaceInput)
                    : place.kind === 'company'
                      ? ({ companyId: place.key.slice(8) } as PlaceInput)
                      : newPlace,
            };
          })
      : text
          .split(/\r?\n/)
          .map(cleanLine)
          .filter(Boolean)
          .map((line) => {
            const tag = taggedPlace(line);
            return tag
              ? { title: tag.title, place: tag.place }
              : { title: line, place: placeUnder(before) };
          });
    if (!items.length) return;
    if (empty && t) day.remove(t.id);
    const made = await day.addMany(items, before?.id ?? null);
    if (!made.length) return;
    commit(
      insertAfter(
        fullKeys.filter((k) => !(empty && t && k === keyOf(t))),
        made.map((m) => m.id),
        anchorKey,
      ),
    );
    focusLine(made.at(-1)!.id, 'end');
  };

  /* ------------------------------------------------------------------ */

  const moveBy = (keys: string[], step: -1 | 1) => {
    const first = lineKeys.indexOf(keys[0]);
    const last = lineKeys.indexOf(keys.at(-1)!);
    if (first < 0 || last < 0) return;
    const target = lineKeys[step < 0 ? first - 1 : last + 1];
    if (!target) return;
    commitShown(
      moveKeys(lineKeys, keys, target, step < 0 ? 'before' : 'after'),
    );
  };

  const toggleDone = (t: DayTask) => {
    if (!editable || (!t.title.trim() && t.draft)) return;
    const done = rowStatus(t, day.points, day.date) === 'done';
    day.move(t.id, done ? 'todo' : 'done');
  };

  const onLineKey = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    t: DayTask,
    i: number,
  ) => {
    const el = e.currentTarget;
    const key = keyOf(t);
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const atEnd =
      el.selectionStart === el.value.length &&
      el.selectionEnd === el.value.length;
    const mod = e.metaKey || e.ctrlKey;
    if (e.nativeEvent.isComposing) return;

    if (e.ctrlKey && !e.metaKey && !e.altKey && e.key === ' ') {
      e.preventDefault();
      toggleDone(t);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !mod && !e.altKey) {
      e.preventDefault();
      day.flush(t.id);
      newLineAfter(t);
      return;
    }
    if (e.key === 'Backspace' && !el.value && !mod) {
      e.preventDefault();
      const prev = lines[i - 1];
      day.remove(t.id);
      if (prev) focusLine(keyOf(prev), 'end');
      return;
    }
    if (e.altKey && !mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      day.flush(t.id);
      moveBy([key], e.key === 'ArrowUp' ? -1 : 1);
      focusLine(key, 'end');
      return;
    }
    if (e.shiftKey && !mod && !e.altKey) {
      const whole =
        el.selectionStart === 0 && el.selectionEnd === el.value.length;
      if (e.key === 'ArrowUp' && (el.selectionStart === 0 || whole)) {
        e.preventDefault();
        day.flush(t.id);
        pickBlock(key, lineKeys[Math.max(0, i - 1)]);
        return;
      }
      if (
        e.key === 'ArrowDown' &&
        (el.selectionEnd === el.value.length || whole)
      ) {
        e.preventDefault();
        day.flush(t.id);
        pickBlock(key, lineKeys[Math.min(lineKeys.length - 1, i + 1)]);
        return;
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      day.flush(t.id);
      if (clip) setClip(null);
      pickBlock(key, key);
      return;
    }
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'a') {
      // A second Cmd+A picks every line.
      const whole =
        el.selectionStart === 0 && el.selectionEnd === el.value.length;
      if (whole && lineKeys.length) {
        e.preventDefault();
        day.flush(t.id);
        pickBlock(lineKeys[0], lineKeys.at(-1)!);
      }
      return;
    }
    if (!e.shiftKey && !mod && !e.altKey) {
      if (e.key === 'ArrowUp' && atStart && i > 0) {
        e.preventDefault();
        focusLine(lineKeys[i - 1], 'end');
      } else if (e.key === 'ArrowDown' && atEnd && i < lines.length - 1) {
        e.preventDefault();
        focusLine(lineKeys[i + 1], 'start');
      }
    }
  };

  const onBlockKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!block || e.target !== e.currentTarget) return;
    const mod = e.metaKey || e.ctrlKey;
    const head = lineKeys.indexOf(block.head);
    if (e.key === 'Escape') {
      e.preventDefault();
      setBlock(null);
      setClip(null);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.key === 'ArrowUp' ? -1 : 1;
      if (e.altKey) {
        if (editable) moveBy(picked, step);
        return;
      }
      const next =
        lineKeys[Math.min(lineKeys.length - 1, Math.max(0, head + step))];
      if (e.shiftKey) setBlock({ anchor: block.anchor, head: next });
      else {
        setBlock(null);
        focusLine(next, 'end');
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      setBlock(null);
      focusLine(block.head, 'end');
      return;
    }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      if (lineKeys.length)
        setBlock({ anchor: lineKeys[0], head: lineKeys.at(-1)! });
      return;
    }
    if (mod && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x')) {
      e.preventDefault();
      const cut = e.key.toLowerCase() === 'x' && editable;
      const text = copyLines(picked, cut ? 'cut' : 'copy');
      if (text) toClipboard(text);
      return;
    }
    if (mod && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      const target = byKey.get(
        lineKeys[Math.max(...picked.map((k) => lineKeys.indexOf(k)))],
      );
      const internal = clip?.text;
      const read = navigator.clipboard?.readText
        ? navigator.clipboard.readText().catch(() => internal ?? '')
        : Promise.resolve(internal ?? '');
      read.then((text) => {
        setBlock(null);
        pasteAt(target, text || internal || '');
      });
    }
  };

  /* ------------------------------------------------------------------ */

  // Dragging a line (or the block it is in) by its handle.
  const [drag, setDrag] = useState<string[] | null>(null);
  const [drop, setDrop] = useState<{
    key: string;
    where: 'before' | 'after';
  } | null>(null);

  const endDrag = () => {
    setDrag(null);
    setDrop(null);
  };

  if (!lines.length && !editable)
    return (
      <p className="px-2 pb-1 pt-2 text-sm text-neutral-500">
        Nothing on this day.
      </p>
    );

  return (
    <div
      ref={container}
      tabIndex={-1}
      role="list"
      aria-label="Plan"
      onKeyDown={onBlockKey}
      onBlur={(e) => {
        // Clicking away lets the block go; moving into a line does too.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setBlock(null);
      }}
      className="py-1 focus:outline-none"
    >
      {lines.map((t, i) => {
        const key = keyOf(t);
        const done = rowStatus(t, day.points, day.date) === 'done';
        const place = placeOfTask(t);
        const showTag = tagged && place.kind !== 'none' && !!t.title.trim();
        const isPicked = picked.includes(key);
        const isCut = cutKeys.includes(key);
        return (
          <div
            key={key}
            role="listitem"
            onDragOver={(e) => {
              if (!drag) return;
              e.preventDefault();
              const box = e.currentTarget.getBoundingClientRect();
              const where =
                e.clientY < box.top + box.height / 2 ? 'before' : 'after';
              if (drop?.key !== key || drop.where !== where)
                setDrop({ key, where });
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (drag && drop)
                commitShown(moveKeys(lineKeys, drag, drop.key, drop.where));
              endDrag();
            }}
            className={cn(
              'group relative flex items-start gap-2 rounded-md py-[3px] pl-6 pr-2',
              isPicked && 'bg-sky-500/[0.12] auto-light:bg-sky-500/[0.12]',
              isCut && 'opacity-40',
              drag?.includes(key) && 'opacity-40',
            )}
          >
            {drop?.key === key && (
              <span
                className={cn(
                  'pointer-events-none absolute inset-x-6 h-0.5 rounded bg-sky-400',
                  drop.where === 'before' ? '-top-px' : '-bottom-px',
                )}
              />
            )}
            {editable && (
              // The handle: click to pick the line (Shift for a block), drag
              // to move it.
              <button
                type="button"
                tabIndex={-1}
                draggable
                aria-label="Pick or drag this line"
                onClick={(e) => {
                  day.flush(t.id);
                  if (e.shiftKey && block) pickBlock(block.anchor, key);
                  else pickBlock(key, key);
                }}
                onDragStart={(e) => {
                  day.flush(t.id);
                  const keys = isPicked ? picked : [key];
                  setDrag(keys);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData(
                    'text/plain',
                    keys
                      .map((k) => byKey.get(k))
                      .filter((x): x is DayTask => !!x)
                      .map(lineText)
                      .join('\n'),
                  );
                }}
                onDragEnd={endDrag}
                className="absolute left-0 top-[5px] flex h-5 w-5 cursor-grab items-center justify-center rounded text-neutral-600 opacity-0 hover:bg-white/[0.06] hover:text-neutral-300 group-hover:opacity-100 auto-light:text-neutral-400 auto-light:hover:bg-black/[0.06] auto-light:hover:text-neutral-700"
              >
                <Icon name="drag_indicator" className="text-[16px]" />
              </button>
            )}
            <button
              type="button"
              tabIndex={-1}
              disabled={!editable}
              aria-label={done ? 'Mark not done' : 'Mark done'}
              aria-pressed={done}
              onClick={() => toggleDone(t)}
              className={cn(
                'mt-[3px] flex size-[18px] shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-default',
                done
                  ? 'bg-emerald-500 text-white auto-light:bg-emerald-600'
                  : 'border border-neutral-600 text-neutral-600 hover:border-emerald-400 hover:text-emerald-400 auto-light:border-neutral-300 auto-light:text-neutral-300 auto-light:hover:border-emerald-600 auto-light:hover:text-emerald-600',
              )}
            >
              <Icon name="check" className="text-[13px] font-bold" />
            </button>
            <div className="flex min-w-0 flex-1 items-start">
              {showTag &&
                (editable ? (
                  <Picker
                    options={options}
                    onPick={(o: PickerOption) => putIn(t, placeInput(o))}
                    placeholder="Move to a project…"
                    trigger={
                      <button
                        type="button"
                        tabIndex={-1}
                        title="Move it to another project"
                        className="shrink-0 whitespace-nowrap rounded text-sm leading-6 text-neutral-500 hover:text-neutral-200 auto-light:text-neutral-400 auto-light:hover:text-neutral-800"
                      >
                        {place.name}
                        <span className="px-1">-</span>
                      </button>
                    }
                  />
                ) : (
                  <span className="shrink-0 whitespace-nowrap text-sm leading-6 text-neutral-500 auto-light:text-neutral-400">
                    {place.name}
                    <span className="px-1">-</span>
                  </span>
                ))}
              <LineInput
                value={t.title}
                disabled={!editable}
                placeholder={i === 0 ? 'Write a task' : ''}
                inputRef={(el) => {
                  if (el) inputs.current.set(key, el);
                  else inputs.current.delete(key);
                }}
                onChange={(value) => {
                  const tag = tagged ? taggedPlace(value) : null;
                  if (tag) {
                    putIn(t, tag.place);
                    day.editTitle(t.id, tag.title);
                    focusLine(key, 'end');
                    return;
                  }
                  day.editTitle(t.id, value);
                }}
                onBlur={() => day.flush(t.id)}
                onKeyDown={(e) => onLineKey(e, t, i)}
                className={cn(
                  'text-neutral-100 auto-light:text-neutral-900',
                  done &&
                    'text-neutral-500 line-through decoration-neutral-600 auto-light:text-neutral-400 auto-light:decoration-neutral-300',
                )}
                // Pastes, copies and cuts of whole lines.
                onPaste={(e: React.ClipboardEvent<HTMLTextAreaElement>) => {
                  const text = e.clipboardData.getData('text/plain');
                  const ours = clip && clip.text.trim() === text.trim();
                  if (!ours && !text.includes('\n')) return;
                  e.preventDefault();
                  day.flush(t.id);
                  pasteAt(t, text);
                }}
                onCopy={(e: React.ClipboardEvent<HTMLTextAreaElement>) => {
                  const el = e.currentTarget;
                  if (el.selectionStart !== el.selectionEnd) return;
                  const text = copyLines([key], 'copy');
                  if (!text) return;
                  e.preventDefault();
                  e.clipboardData.setData('text/plain', text);
                }}
                onCut={(e: React.ClipboardEvent<HTMLTextAreaElement>) => {
                  const el = e.currentTarget;
                  if (el.selectionStart !== el.selectionEnd || !editable)
                    return;
                  day.flush(t.id);
                  const text = copyLines([key], 'cut');
                  if (!text) return;
                  e.preventDefault();
                  e.clipboardData.setData('text/plain', text);
                }}
              />
            </div>
          </div>
        );
      })}
      {editable && (
        // Below the last line: a click starts a new one.
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            const last = lines.at(-1);
            if (last && !last.title.trim()) focusLine(keyOf(last), 'end');
            else newLineAfter(last);
          }}
          className={cn(
            'flex w-full items-center gap-2 rounded-md py-1 pl-6 pr-2 text-left text-sm leading-6 text-neutral-600 hover:text-neutral-400 auto-light:text-neutral-400 auto-light:hover:text-neutral-600',
            // Under the lines it stays out of sight until pointed at.
            lines.length > 0 && 'opacity-0 hover:opacity-100',
          )}
        >
          <span className="flex size-[18px] items-center justify-center">
            <Icon name="add" className="text-[16px]" />
          </span>
          {lines.length ? 'New line' : 'Write the plan, one task per line'}
        </button>
      )}
    </div>
  );
};
