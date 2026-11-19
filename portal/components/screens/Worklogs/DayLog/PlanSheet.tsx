'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { placeInput, placeOf, placeOptions, rowStatus } from './sheetParts';
import type { Day, DayTask, PlaceInput } from './useDay';

/*
 * The worklog's Plan mode: the day as one plain page of text, one task per
 * line with a check in front. It is written like a note: type, Enter,
 * Backspace, select across lines, copy or cut, and paste above or below.
 * Each line remembers its task, so a line cut and pasted elsewhere is the
 * same task moved, a line deleted takes its task out (once the page is
 * left), and a new line becomes a new task.
 *
 * The order is saved for the day and comes back when the plan is opened
 * again; tasks that left the day are skipped. With project tags on, each
 * line reads "Project - task", and writing another project's name in front
 * moves the task there.
 */

const LINE = 'data-line';
const ID_RE = /^[a-f0-9]{24}$/i;

/** One line of the page, as the editor holds it. */
const LINE_CLASS = cn(
  'relative min-h-[30px] py-[3px] pl-8 pr-1 text-sm leading-6 text-neutral-100 auto-light:text-neutral-900',
  // The check in front: a circle, green and ticked when done.
  "before:absolute before:left-1 before:top-[6px] before:flex before:size-[18px] before:cursor-pointer before:items-center before:justify-center before:rounded-full before:border before:border-neutral-600 before:text-[11px] before:font-bold before:leading-none before:text-neutral-600 before:content-['✓'] hover:before:border-emerald-400 auto-light:before:border-neutral-300 auto-light:before:text-neutral-300",
  'data-[done]:text-neutral-500 data-[done]:line-through data-[done]:decoration-neutral-600 data-[done]:before:border-emerald-500 data-[done]:before:bg-emerald-500 data-[done]:before:text-white auto-light:data-[done]:text-neutral-400 auto-light:data-[done]:before:border-emerald-600 auto-light:data-[done]:before:bg-emerald-600',
);

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const lineHtml = (
  text: string,
  id?: string | null,
  done = false,
  pasted = false,
) =>
  `<div ${LINE}="1" class="${LINE_CLASS}"${id ? ` data-id="${id}"` : ''}${
    done ? ' data-done="1"' : ''
  }${pasted ? ' data-pasted="1"' : ''}>${text ? escapeHtml(text) : '<br>'}</div>`;

/** A pasted line as a task: list marks and checkboxes taken off. */
const cleanLine = (line: string) =>
  line
    .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, '')
    .replace(/^\s*\[[ xX✓]?\]\s*/, '')
    .replace(/^\s*[✓✔✅☐☑]\s*/, '')
    .trim();

/** The line a node is in. */
const lineOf = (node: Node | null, root: HTMLElement | null) => {
  let el: Node | null = node;
  while (el && el !== root) {
    if (el instanceof HTMLElement && el.hasAttribute(LINE)) return el;
    el = el.parentNode;
  }
  return null;
};

const textOfRow = (row: HTMLElement) =>
  (row.innerText ?? '').replace(/\n/g, ' ').trim();

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
  /** Where a new line goes when it names no project (the picked company). */
  newPlace: PlaceInput | null;
}) => {
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
    return day.tasks
      .filter((t) => !t.draft)
      .map((t, i) => ({ t, i, p: pos.get(t.id) }))
      .sort((a, b) => {
        if (a.p !== undefined && b.p !== undefined) return a.p - b.p;
        if (a.p !== undefined) return -1;
        if (b.p !== undefined) return 1;
        return a.i - b.i;
      })
      .map((x) => x.t);
  }, [day.tasks, order]);
  const shownIds = useMemo(() => new Set(shown.map((t) => t.id)), [shown]);
  const lines = useMemo(
    () => sorted.filter((t) => shownIds.has(t.id)),
    [sorted, shownIds],
  );

  // Saved a moment after a change.
  const saveRef = useRef(day.saveOrder);
  saveRef.current = day.saveOrder;
  const lastSaved = useRef('');
  useEffect(() => {
    if (!dirty.current || !editable) return;
    const ids = sorted.map((t) => t.id);
    const sig = ids.join(',');
    if (sig === lastSaved.current) return;
    const timer = setTimeout(() => {
      lastSaved.current = sig;
      saveRef.current(ids);
    }, 500);
    return () => clearTimeout(timer);
  }, [sorted, editable]);

  const options = useMemo(
    () => placeOptions(day.projects, day.companies),
    [day.projects, day.companies],
  );
  const isDone = useCallback(
    (t: DayTask) => rowStatus(t, day.points, day.date) === 'done',
    [day.points, day.date],
  );
  const textOf = useCallback(
    (t: DayTask) => {
      const place = placeOf(t, day.projects, day.companies);
      return tagged && place.kind !== 'none'
        ? `${place.name} - ${t.title.trim()}`
        : t.title.trim();
    },
    [tagged, day.projects, day.companies],
  );

  /** A project named in front of a task ("PORTAL - fix login"). */
  const taggedPlace = useCallback(
    (
      text: string,
    ): { place: PlaceInput; key: string; title: string } | null => {
      const m = text.match(/^\s*(.+?)\s+[-–]\s+(\S.*)$/);
      if (!m) return null;
      const name = m[1].trim().toLowerCase();
      const option =
        options.find(
          (o) => o.label.toLowerCase() === name && o.id.startsWith('project:'),
        ) ?? options.find((o) => o.label.toLowerCase() === name);
      if (!option || option.id === 'none') return null;
      return { place: placeInput(option), key: option.id, title: m[2].trim() };
    },
    [options],
  );

  /* ------------------------------------------------------------------ */

  const root = useRef<HTMLDivElement | null>(null);
  const [focused, setFocused] = useState(false);
  const [empty, setEmpty] = useState(false);

  // The page as the tasks have it; written in while no one is typing.
  const html = useMemo(
    () =>
      (lines.length ? lines : [null])
        .map((t) => (t ? lineHtml(textOf(t), t.id, isDone(t)) : lineHtml('')))
        .join(''),
    [lines, textOf, isDone],
  );
  useEffect(() => {
    const el = root.current;
    if (!el || focused) return;
    if (el.innerHTML !== html) el.innerHTML = html;
    setEmpty(!lines.length);
  }, [html, focused, lines.length]);
  // While typing, only the checks follow the tasks.
  useEffect(() => {
    const el = root.current;
    if (!el || !focused) return;
    const done = new Map(day.tasks.map((t) => [t.id, isDone(t)] as const));
    el.querySelectorAll<HTMLElement>(`[${LINE}]`).forEach((line) => {
      const id = line.dataset.id;
      if (!id || !done.has(id)) return;
      if (done.get(id)) line.setAttribute('data-done', '1');
      else line.removeAttribute('data-done');
    });
  }, [day.tasks, focused, isDone]);

  /* ------------------------------------------------------------------ */

  const byIdRef = useRef(new Map<string, DayTask>());
  byIdRef.current = new Map(day.tasks.map((t) => [t.id, t] as const));
  const creating = useRef(false);

  /** The lines on the page now, top to bottom, each task on one line. */
  const readLines = () => {
    const el = root.current;
    if (!el) return [];
    // Text typed straight into the page (after it was emptied) is a line.
    Array.from(el.childNodes).forEach((node) => {
      if (node instanceof HTMLElement && node.hasAttribute(LINE)) return;
      const wrap = document.createElement('div');
      wrap.innerHTML = lineHtml((node.textContent ?? '').trim());
      el.replaceChild(wrap.firstElementChild!, node);
    });
    const rows = Array.from(el.querySelectorAll<HTMLElement>(`[${LINE}]`));
    // Where lines share a task (a line split in two, a copy pasted), the
    // one that reads like the task keeps it, else the first not just pasted.
    const groups = new Map<string, HTMLElement[]>();
    rows.forEach((row) => {
      const id = row.dataset.id;
      if (!id) return;
      if (!ID_RE.test(id) || !byIdRef.current.has(id)) {
        // From another day, or a task gone: a new line.
        row.removeAttribute('data-id');
        row.removeAttribute('data-done');
        return;
      }
      groups.set(id, [...(groups.get(id) ?? []), row]);
    });
    groups.forEach((rowsOf, id) => {
      if (rowsOf.length < 2) return;
      const task = byIdRef.current.get(id)!;
      const keep =
        rowsOf.find((r) => textOfRow(r) === textOf(task)) ??
        rowsOf.find((r) => !r.dataset.pasted && textOfRow(r)) ??
        rowsOf[0];
      rowsOf.forEach((r) => {
        if (r === keep) return;
        r.removeAttribute('data-id');
        r.removeAttribute('data-done');
      });
    });
    rows.forEach((r) => r.removeAttribute('data-pasted'));
    return rows.map((row) => ({
      row,
      id: row.dataset.id ?? null,
      text: textOfRow(row),
    }));
  };

  /** Brings the tasks in line with the page; on leaving it, removals too. */
  const sync = async (leaving = false) => {
    if (!editable) return;
    const rows = readLines();
    setEmpty(!rows.some((r) => r.text));
    // Words and projects of the lines that have tasks.
    for (const r of rows) {
      if (!r.id || !r.text) continue;
      const task = byIdRef.current.get(r.id);
      if (!task) continue;
      let title = r.text;
      if (tagged) {
        const tag = taggedPlace(r.text);
        if (tag) {
          title = tag.title;
          const now = placeOf(task, day.projects, day.companies);
          if (now.key !== tag.key) day.place(task.id, tag.place);
        }
      }
      if (title !== task.title.trim()) day.editTitle(task.id, title);
    }
    // New lines become tasks, one after another, under the line above.
    if (!creating.current) {
      creating.current = true;
      try {
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          if (r.row.dataset.id || !r.text || r.row.dataset.pending) continue;
          r.row.dataset.pending = '1';
          const above = rows
            .slice(0, i)
            .reverse()
            .find((x) => x.row.dataset.id)?.row.dataset.id;
          const tag = tagged ? taggedPlace(r.text) : null;
          const made = await day.addMany(
            [
              {
                title: tag ? tag.title : r.text,
                place: tag ? tag.place : newPlace,
              },
            ],
            above ?? null,
          );
          delete r.row.dataset.pending;
          if (made[0]) {
            r.row.dataset.id = made[0].id;
            byIdRef.current.set(made[0].id, made[0]);
          }
        }
      } finally {
        creating.current = false;
      }
    }
    // The order of the page, put back among the lines another tab hides.
    const ids = Array.from(
      root.current?.querySelectorAll<HTMLElement>(`[${LINE}][data-id]`) ?? [],
    )
      .filter((row) => textOfRow(row))
      .map((row) => row.dataset.id!);
    const onPage = new Set(ids);
    const placed = new Set(lines.map((t) => t.id));
    const all = sorted.map((t) => t.id);
    const next: string[] = [];
    let j = 0;
    for (const id of all) {
      if (!placed.has(id)) next.push(id);
      else if (j < ids.length) next.push(ids[j++]);
    }
    while (j < ids.length) next.push(ids[j++]);
    if (next.join(',') !== all.join(',')) {
      dirty.current = true;
      setOrder(next);
    }
    // Lines taken off the page take their tasks out once the page is left,
    // so a cut line can still be pasted back first.
    if (leaving) for (const t of lines) if (!onPage.has(t.id)) day.remove(t.id);
  };
  const syncRef = useRef(sync);
  syncRef.current = sync;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soon = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => syncRef.current(), 700);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /* ------------------------------------------------------------------ */

  /** The whole lines a selection runs across, when it crosses lines. */
  const selectedRows = () => {
    const el = root.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const first = lineOf(range.startContainer, el);
    let last = lineOf(range.endContainer, el);
    if (!first || !last || first === last) return null;
    const rows = Array.from(el.querySelectorAll<HTMLElement>(`[${LINE}]`));
    // Ending at the very start of a line (Shift+Down) leaves that line out.
    const into = document.createRange();
    into.selectNodeContents(last);
    into.setEnd(range.endContainer, range.endOffset);
    if (!into.toString().length) last = rows[rows.indexOf(last) - 1];
    if (!last || last === first) return [first];
    return rows.slice(rows.indexOf(first), rows.indexOf(last) + 1);
  };

  /** Puts the cursor at the start or end of a line. */
  const placeCaret = (row: HTMLElement | null, where: 'start' | 'end') => {
    const sel = window.getSelection();
    if (!row || !sel) return;
    const range = document.createRange();
    range.selectNodeContents(row);
    range.collapse(where === 'start');
    sel.removeAllRanges();
    sel.addRange(range);
  };

  /** Copying across lines takes whole lines, each with its task. */
  const onCopy = (e: React.ClipboardEvent<HTMLDivElement>, cut = false) => {
    const rows = selectedRows();
    if (!rows) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', rows.map(textOfRow).join('\n'));
    e.clipboardData.setData(
      'text/html',
      `<div data-plan="1">${rows
        .map((r) => lineHtml(textOfRow(r), r.dataset.id))
        .join('')}</div>`,
    );
    if (!cut || !editable) return;
    // Out go the whole lines; the cursor goes where they were.
    const next =
      rows.at(-1)!.nextElementSibling ?? rows[0].previousElementSibling;
    rows.forEach((r) => r.remove());
    const el = root.current!;
    if (!el.querySelector(`[${LINE}]`)) el.innerHTML = lineHtml('');
    placeCaret(
      (next as HTMLElement | null) ??
        el.querySelector<HTMLElement>(`[${LINE}]`),
      'start',
    );
    soon();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!editable) return;
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    let pasted: { text: string; id?: string }[] | null = null;
    if (html.includes('data-plan="1"')) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      pasted = Array.from(doc.querySelectorAll<HTMLElement>(`[${LINE}]`)).map(
        (r) => ({
          text: (r.textContent ?? '').trim(),
          id: ID_RE.test(r.dataset.id ?? '') ? r.dataset.id : undefined,
        }),
      );
    } else if (/\r?\n/.test(text.trim())) {
      pasted = text
        .split(/\r?\n/)
        .map(cleanLine)
        .filter(Boolean)
        .map((t) => ({ text: t }));
    }
    if (!pasted) {
      // Words from one line: typed in where the cursor is.
      document.execCommand('insertText', false, text.replace(/\s+/g, ' '));
      soon();
      return;
    }
    // Whole lines go in above the cursor's line when the cursor is at its
    // start, below it otherwise; an empty line makes way for them.
    const el = root.current!;
    const sel = window.getSelection();
    const at = sel?.rangeCount
      ? lineOf(sel.getRangeAt(0).startContainer, el)
      : null;
    const wrap = document.createElement('div');
    wrap.innerHTML = pasted
      .map((p) => lineHtml(p.text, p.id, false, true))
      .join('');
    const made = Array.from(wrap.children) as HTMLElement[];
    if (!made.length) return;
    const frag = document.createDocumentFragment();
    made.forEach((m) => frag.appendChild(m));
    if (at && sel) {
      const caret = sel.getRangeAt(0);
      const before = document.createRange();
      before.selectNodeContents(at);
      before.setEnd(caret.startContainer, caret.startOffset);
      if (!textOfRow(at)) at.replaceWith(frag);
      else if (!before.toString().length) at.before(frag);
      else at.after(frag);
    } else el.appendChild(frag);
    placeCaret(made.at(-1)!, 'end');
    soon();
  };

  const toggle = (row: HTMLElement | null) => {
    if (!editable || !row) return;
    const id = row.dataset.id;
    const task = id ? byIdRef.current.get(id) : undefined;
    if (!task) return;
    const done = isDone(task);
    if (done) row.removeAttribute('data-done');
    else row.setAttribute('data-done', '1');
    day.move(task.id, done ? 'todo' : 'done');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Ctrl+Space ticks the line the cursor is in.
    if (e.ctrlKey && !e.metaKey && !e.altKey && e.key === ' ') {
      e.preventDefault();
      const sel = window.getSelection();
      toggle(
        sel?.rangeCount
          ? lineOf(sel.getRangeAt(0).startContainer, root.current)
          : null,
      );
    }
  };

  return (
    <div className="relative py-1">
      {empty && !focused && (
        <p className="pointer-events-none absolute left-10 top-[7px] text-sm leading-6 text-neutral-600 auto-light:text-neutral-400">
          {editable
            ? 'Write the plan, one task per line'
            : 'Nothing on this day.'}
        </p>
      )}
      <div
        ref={root}
        role="textbox"
        aria-multiline
        aria-label="Plan"
        contentEditable={editable}
        suppressContentEditableWarning
        spellCheck={false}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          syncRef.current(true).finally(() => setFocused(false));
        }}
        onInput={soon}
        onKeyDown={onKeyDown}
        onCopy={(e) => onCopy(e)}
        onCut={(e) => onCopy(e, true)}
        onPaste={onPaste}
        onMouseDown={(e) => {
          // A click on a line's check ticks it.
          const row = lineOf(e.target as Node, root.current);
          if (!row) return;
          if (e.clientX - row.getBoundingClientRect().left > 28) return;
          e.preventDefault();
          toggle(row);
        }}
        className="min-h-[120px] whitespace-pre-wrap break-words px-1 pb-6 focus:outline-none"
      />
    </div>
  );
};
