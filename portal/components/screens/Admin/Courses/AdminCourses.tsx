'use client';

import type { JSONContent } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { lessonDoc } from '@/lib/courses/lessonDoc';
import type { CourseView } from '@/lib/courses/server';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/utils/hooks/useWorkspace';
import { PortalSdk } from '@/utils/services/PortalSdk';

import { DocEditor } from '../../Project/DocEditor';
import { SaveBadge, type SaveState } from '../../Project/PageDoc';
import {
  AdminButton,
  AdminModal,
  CopyButton,
  EmptyState,
  Field,
  Icon,
  IconAction,
  Panel,
  Pill,
  SkeletonRows,
  TextArea,
  TextInput,
  ToggleSwitch,
} from '../shared/AdminUI';
import { CompanyPicker, errorText, NeedsCompany } from '../Workspace/shared';

type Lesson = {
  id: string;
  title: string;
  body: string;
  content?: JSONContent | null;
};

const SAVE_AFTER_MS = 800;

const newLesson = (): Lesson => ({
  id: Math.random().toString(36).slice(2, 10),
  title: '',
  body: '',
  content: null,
});

/** A one-line-looking title that wraps and grows like a page heading. */
const GrowingTitle = (
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} />;
};

type Draft = { title: string; description: string; lessons: Lesson[] };
const draftOf = (c: CourseView): Draft => ({
  title: c.title,
  description: c.description ?? '',
  lessons: c.lessons as Lesson[],
});

/**
 * Writes one course like a project page: lessons down the side, each one a
 * page in the same editor (press / for headings, lists, videos and more).
 * Everything saves by itself a moment after the last change.
 */
const CourseEditor = ({
  course,
  onSaved,
  onDeleted,
}: {
  course: CourseView;
  onSaved: (course: CourseView) => void;
  onDeleted: () => void;
}) => {
  const [draft, setDraft] = useState<Draft>(() => draftOf(course));
  const [active, setActive] = useState<string | null>(
    course.lessons[0]?.id ?? null,
  );
  const [state, setState] = useState<SaveState>('idle');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savingReady, setSavingReady] = useState(false);

  // What the server last has, so only real changes save.
  const saved = useRef(JSON.stringify(draftOf(course)));
  const latest = useRef(draft);
  latest.current = draft;
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const handlers = useRef({ onSaved });
  handlers.current = { onSaved };

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const next = latest.current;
    const json = JSON.stringify(next);
    if (json === saved.current) return;
    if (!next.title.trim()) return; // a course needs a title; wait for one
    setState('saving');
    try {
      const res = await PortalSdk.patchData(`/api/courses/${course.id}`, {
        title: next.title,
        description: next.description,
        lessons: next.lessons.map((l) => ({
          ...l,
          title: l.title.trim() || 'Untitled lesson',
        })),
      });
      saved.current = json;
      handlers.current.onSaved(res.data.course);
      setState(JSON.stringify(latest.current) === json ? 'saved' : 'saving');
    } catch (err) {
      setState('error');
      toast.error(errorText(err));
    }
  }, [course.id]);

  // Save a moment after the last change, and when the course is left.
  useEffect(() => {
    if (JSON.stringify(draft) === saved.current) return;
    setState('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_AFTER_MS);
  }, [draft, flush]);
  useEffect(
    () => () => {
      flush();
    },
    [flush],
  );

  const lessons = draft.lessons;
  const index = lessons.findIndex((l) => l.id === active);
  const lesson = lessons[index] ?? null;

  const editLesson = (id: string, patch: Partial<Lesson>) =>
    setDraft((d) => ({
      ...d,
      lessons: d.lessons.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  const move = (id: string, by: number) =>
    setDraft((d) => {
      const i = d.lessons.findIndex((l) => l.id === id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= d.lessons.length) return d;
      const next = [...d.lessons];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...d, lessons: next };
    });
  const addLesson = () => {
    const l = newLesson();
    setDraft((d) => ({ ...d, lessons: [...d.lessons, l] }));
    setActive(l.id);
  };
  const removeLesson = (id: string) => {
    const rest = lessons.filter((l) => l.id !== id);
    setDraft((d) => ({ ...d, lessons: rest }));
    setActive(rest[Math.max(0, index - 1)]?.id ?? null);
  };

  // Saved straight away, apart from the writing.
  const setReady = async (ready: boolean) => {
    setSavingReady(true);
    try {
      const res = await PortalSdk.patchData(`/api/courses/${course.id}`, {
        ready,
      });
      onSaved(res.data.course);
      toast.success(
        ready
          ? 'New hires will get this course'
          : 'Left out of onboarding until ready',
      );
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSavingReady(false);
    }
  };

  const remove = async () => {
    try {
      clearTimeout(timer.current);
      saved.current = JSON.stringify(latest.current);
      await PortalSdk.deleteData(`/api/courses/${course.id}`, null);
      onDeleted();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const link =
    typeof window !== 'undefined'
      ? `${window.location.origin}/courses/${course.id}`
      : '';

  return (
    <Panel className="flex min-w-0 flex-col">
      <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 auto-light:border-black/[0.08]">
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="Course title"
            className="h-10 min-w-0 flex-1 text-base font-semibold"
          />
          {course.isIntro &&
            (course.ready ? (
              <Pill tone="info" icon="how_to_reg">
                Sent to new hires
              </Pill>
            ) : (
              <Pill tone="warning" icon="pending">
                Not sent yet
              </Pill>
            ))}
          <SaveBadge state={state} />
          <CopyButton value={link} label="Copy the course link" />
          <a href={`/courses/${course.id}`} target="_blank" rel="noreferrer">
            <IconAction icon="open_in_new" label="Open as a learner" />
          </a>
          {!course.isIntro && (
            <IconAction
              icon="delete"
              label="Delete course"
              tone="danger"
              onClick={() => setConfirmDelete(true)}
            />
          )}
        </div>
        <TextArea
          value={draft.description}
          onChange={(e) =>
            setDraft((d) => ({ ...d, description: e.target.value }))
          }
          placeholder="What this course is for, in a line or two"
          className="min-h-[56px]"
        />
        {course.isIntro && (
          <ToggleSwitch
            checked={course.ready}
            disabled={savingReady}
            onChange={setReady}
            label="Ready for new hires"
            description={
              course.ready
                ? 'New hires get a link to this course with their Portal sign-in.'
                : 'Still being set up, so it’s left out of onboarding emails and the join page. Turn this on when it’s ready.'
            }
          />
        )}
      </div>

      <div className="grid min-h-[560px] md:grid-cols-[240px_minmax(0,1fr)]">
        <div className="flex flex-col gap-1 border-b border-white/[0.07] p-3 auto-light:border-black/[0.08] md:border-b-0 md:border-r">
          <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Lessons
          </p>
          {lessons.map((l, i) => (
            <div
              key={l.id}
              className={cn(
                'group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors',
                l.id === active
                  ? 'bg-white/[0.08] text-white auto-light:bg-black/[0.06] auto-light:text-neutral-950'
                  : 'text-neutral-400 hover:bg-white/[0.04] auto-light:text-neutral-600 auto-light:hover:bg-black/[0.04]',
              )}
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[10px] text-neutral-400 auto-light:bg-black/[0.06]">
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => setActive(l.id)}
                className="min-w-0 flex-1 truncate text-left"
              >
                {l.title || 'Untitled lesson'}
              </button>
              <span className="hidden gap-0.5 group-hover:flex">
                <button
                  type="button"
                  aria-label="Move up"
                  onClick={() => move(l.id, -1)}
                  className="text-neutral-500 hover:text-white auto-light:hover:text-neutral-950"
                >
                  <Icon name="arrow_upward" className="text-[14px]" />
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  onClick={() => move(l.id, 1)}
                  className="text-neutral-500 hover:text-white auto-light:hover:text-neutral-950"
                >
                  <Icon name="arrow_downward" className="text-[14px]" />
                </button>
              </span>
            </div>
          ))}
          <button
            type="button"
            onClick={addLesson}
            className="mt-1 flex items-center gap-2 rounded-lg border border-dashed border-white/10 p-2 text-sm text-neutral-400 hover:border-white/25 hover:text-white auto-light:border-black/15 auto-light:text-neutral-600 auto-light:hover:border-black/30 auto-light:hover:text-neutral-950"
          >
            <Icon name="add" className="text-[16px]" />
            Add a lesson
          </button>
        </div>

        <div className="min-w-0">
          {lesson ? (
            <article className="mx-auto w-full max-w-3xl px-6 pt-8 md:px-10">
              <div className="mb-1 flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Lesson {index + 1} of {lessons.length}
                </p>
                <div className="flex-1" />
                <IconAction
                  icon="delete"
                  label="Remove lesson"
                  tone="danger"
                  onClick={() => removeLesson(lesson.id)}
                />
              </div>
              <GrowingTitle
                value={lesson.title}
                autoFocus={!lesson.title}
                onChange={(e) =>
                  editLesson(lesson.id, {
                    title: e.target.value.replace(/\n/g, ' '),
                  })
                }
                placeholder="Lesson title"
                className="mb-5 w-full resize-none bg-transparent text-3xl font-bold leading-tight tracking-tight text-white outline-none placeholder:text-neutral-700 auto-light:text-neutral-950 auto-light:placeholder:text-neutral-300"
              />
              <DocEditor
                key={lesson.id}
                content={lessonDoc(lesson)}
                editable
                placeholder="Write the lesson, or press / for headings, lists, videos…"
                onChange={(content) => editLesson(lesson.id, { content })}
              />
            </article>
          ) : (
            <EmptyState
              icon="edit_note"
              title={
                course.isIntro ? 'This course is still empty' : 'No lessons yet'
              }
              description={
                course.isIntro
                  ? 'New hires get a link to it with their sign-in once it’s marked ready. Add lessons on worklogs, projects, and setting up Claude. You can also ask Claude to write it with you.'
                  : 'Add a lesson to start.'
              }
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-white/[0.07] px-4 py-3 text-xs text-neutral-500 auto-light:border-black/[0.08]">
        {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'} · Saves
        as you write. Type / in a lesson for videos, images, callouts and more.
      </div>

      <AdminModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this course?"
        icon="delete"
        size="sm"
        footer={
          <>
            <AdminButton
              tone="ghost"
              size="sm"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </AdminButton>
            <AdminButton tone="danger" size="sm" icon="delete" onClick={remove}>
              Delete
            </AdminButton>
          </>
        }
      >
        <p className="text-sm text-neutral-400">
          Its lessons and everyone’s progress go with it.
        </p>
      </AdminModal>
    </Panel>
  );
};

/** Admin > Courses: a company's courses, the Portal course first. */
export type { CourseView };

export const AdminCourses = ({
  selectedCompanyId,
  onSelectCompany,
  embedded,
  activeId: controlledId,
  onActiveChange,
  onCoursesChange,
  createSignal,
}: {
  selectedCompanyId: string | null;
  onSelectCompany: (companyId: string) => void;
  /**
   * Inside the Hiring space: the sidebar lists the courses and picks one,
   * so this shows only the open course.
   */
  embedded?: boolean;
  activeId?: string | null;
  onActiveChange?: (id: string | null) => void;
  onCoursesChange?: (courses: CourseView[]) => void;
  /** Bumping it opens the "New course" dialog. */
  createSignal?: number;
}) => {
  const { workCompanies: companies, can } = useWorkspace();
  const editable = companies.filter((c) => can(c.company.id, 'courses:edit'));
  const companyId = editable.some((c) => c.company.id === selectedCompanyId)
    ? selectedCompanyId
    : (editable[0]?.company.id ?? null);

  const [courses, setCourses] = useState<CourseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownActiveId, setOwnActiveId] = useState<string | null>(null);
  const activeId = controlledId !== undefined ? controlledId : ownActiveId;
  // Stable, so loading the list doesn't run again on every pick.
  const controlled = useRef({ controlledId, onActiveChange });
  controlled.current = { controlledId, onActiveChange };
  const setActiveId = useCallback(
    (next: string | null | ((current: string | null) => string | null)) => {
      const { controlledId: id, onActiveChange: notify } = controlled.current;
      setOwnActiveId((current) => {
        const value =
          typeof next === 'function'
            ? next(id !== undefined ? id : current)
            : next;
        if (notify) queueMicrotask(() => notify(value));
        return value;
      });
    },
    [],
  );

  useEffect(() => {
    if (createSignal) setCreating(true);
  }, [createSignal]);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await PortalSdk.getData(
        `/api/courses?companyId=${companyId}`,
        null,
      );
      const list: CourseView[] = res?.data?.courses ?? [];
      setCourses(list);
      setActiveId((a) =>
        list.some((c) => c.id === a) ? a : (list[0]?.id ?? null),
      );
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!loading) onCoursesChange?.(courses);
  }, [courses, loading, onCoursesChange]);

  const create = async () => {
    try {
      const res = await PortalSdk.postData('/api/courses', {
        companyId,
        title: newTitle,
      });
      setCourses((all) => [...all, res.data.course]);
      setActiveId(res.data.course.id);
      setCreating(false);
      setNewTitle('');
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  if (!companyId)
    return <NeedsCompany text="Courses are written by company owners." />;
  const active = courses.find((c) => c.id === activeId) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        {!embedded && (
          <CompanyPicker
            companies={editable}
            value={companyId}
            onChange={onSelectCompany}
          />
        )}
        <div className="flex-1" />
        <AdminButton
          tone="primary"
          icon="add"
          onClick={() => setCreating(true)}
        >
          New course
        </AdminButton>
      </div>

      {loading && !courses.length ? (
        <Panel>
          <SkeletonRows rows={3} />
        </Panel>
      ) : (
        <div
          className={cn(
            'grid gap-4',
            !embedded && 'lg:grid-cols-[260px_minmax(0,1fr)]',
          )}
        >
          <div
            className={cn(
              'flex gap-2 overflow-x-auto lg:flex-col',
              embedded && 'lg:hidden',
            )}
          >
            {courses.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveId(c.id)}
                className={cn(
                  'flex min-w-[200px] flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors',
                  c.id === activeId
                    ? 'border-white/20 bg-white/[0.07]'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15',
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-white">
                  <Icon
                    name={c.isIntro ? 'how_to_reg' : 'school'}
                    className="text-[16px] text-neutral-400"
                  />
                  <span className="truncate">{c.title}</span>
                </span>
                <span className="text-[11px] text-neutral-500">
                  {c.lessons.length
                    ? `${c.lessons.length} lessons`
                    : 'Empty, to write'}
                  {c.isIntro ? (c.ready ? ' · new hires' : ' · not ready') : ''}
                </span>
              </button>
            ))}
          </div>
          {embedded && !active && !courses.length && (
            <Panel>
              <EmptyState
                icon="school"
                title="No courses yet"
                description="Write a short course for your people, like the Portal course new hires get with their sign-in."
              />
            </Panel>
          )}
          {active && (
            <CourseEditor
              key={active.id}
              course={active}
              onSaved={(c) =>
                setCourses((all) => all.map((x) => (x.id === c.id ? c : x)))
              }
              onDeleted={() => {
                setCourses((all) => all.filter((x) => x.id !== active.id));
                setActiveId(null);
              }}
            />
          )}
        </div>
      )}

      <AdminModal
        open={creating}
        onOpenChange={setCreating}
        title="New course"
        icon="school"
        size="sm"
        footer={
          <>
            <AdminButton
              tone="ghost"
              size="sm"
              onClick={() => setCreating(false)}
            >
              Cancel
            </AdminButton>
            <AdminButton
              tone="primary"
              size="sm"
              disabled={!newTitle.trim()}
              onClick={create}
            >
              Create
            </AdminButton>
          </>
        }
      >
        <Field label="Title">
          <TextInput
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            autoFocus
          />
        </Field>
      </AdminModal>
    </div>
  );
};
