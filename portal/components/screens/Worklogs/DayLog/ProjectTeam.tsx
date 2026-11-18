'use client';

import * as Dialog from '@radix-ui/react-dialog';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import { PortalSdk } from '@/utils/services/PortalSdk';

import { Icon } from '../../Admin/shared/AdminUI';
import type { Place } from './sheetParts';
import { PlaceLogo, StatusIcon } from './sheetParts';
import { PersonAvatar } from './TaskActions';

/*
 * Who else is working in a project on the open day. A project worked on by
 * more than one person shows "3 mine / 7 total" at the end of its heading;
 * clicking it opens a panel on the right with the project's tasks on that
 * day, by who is on them, and "+X more" for what each has coming up.
 * Clicking the project's name in its heading opens the same panel, whoever
 * else is on it.
 */

export type TeamTask = {
  id: string;
  title: string;
  status: string;
  flag?: string | null;
  forDate?: string | null;
  /** For a later day: shown behind "+X more". */
  upcoming?: boolean;
};

export type ProjectTeam = {
  mine: number;
  total: number;
  people: {
    id: string;
    name: string;
    avatar: string | null;
    tasks: TeamTask[];
  }[];
};

/** The day's projects' teams, read again a little after a change. */
export function useProjectTeams(
  date: string,
  projectIds: string[],
  version: number,
) {
  const [teams, setTeams] = useState<Record<string, ProjectTeam>>({});
  const ids = projectIds.slice().sort().join(',');
  useEffect(() => {
    if (!ids) {
      setTeams({});
      return;
    }
    let live = true;
    const timer = setTimeout(
      () =>
        PortalSdk.getData(
          `/api/me/day/teams?date=${date}&projects=${encodeURIComponent(ids)}`,
          null,
        )
          .then((res) => live && setTeams(res?.data?.projects ?? {}))
          .catch(() => undefined),
      version ? 800 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [date, ids, version]);
  return teams;
}

/** At the end of a project's heading: "3 mine / 7 total". */
export const TeamCount = ({
  team,
  onOpen,
}: {
  team: ProjectTeam | undefined;
  onOpen: () => void;
}) =>
  team &&
  team.people.filter((p) => p.tasks.some((t) => !t.upcoming)).length > 1 ? (
    <button
      type="button"
      onClick={onOpen}
      title="Everyone's tasks in this project"
      className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] normal-case tracking-normal text-neutral-500 hover:bg-white/[0.06] hover:text-neutral-200 auto-light:hover:bg-black/[0.06] auto-light:hover:text-neutral-800"
    >
      <Icon name="group" className="text-[14px]" />
      <span className="tabular-nums">
        <span className="font-semibold text-neutral-300 auto-light:text-neutral-700">
          {team.mine}
        </span>{' '}
        mine / {team.total} total
      </span>
    </button>
  ) : null;

const statusOf = (t: TeamTask) =>
  t.status === 'DONE'
    ? 'done'
    : t.flag === 'blocked'
      ? 'blocked'
      : t.flag === 'waiting'
        ? 'waiting'
        : t.flag === 'paused'
          ? 'paused'
          : t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW'
            ? 'doing'
            : null;

/** The panel on the right: the project's tasks on the day, by person. */
export const ProjectTeamSheet = ({
  place,
  team,
  date,
  myId,
  onClose,
}: {
  place: Place | null;
  team: ProjectTeam | undefined;
  date: string;
  myId?: string;
  onClose: () => void;
}) => (
  <Dialog.Root open={!!place} onOpenChange={(o) => !o && onClose()}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[1390] bg-black/40" />
      <Dialog.Content
        aria-describedby={undefined}
        className="auto-theme fixed inset-y-0 right-0 z-[1400] flex w-[min(420px,100vw)] flex-col border-l border-white/10 bg-neutral-950 text-neutral-200 shadow-2xl shadow-black/60 focus:outline-none auto-light:border-black/10 auto-light:bg-neutral-50 auto-light:text-neutral-800"
      >
        {place && (
          <>
            <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3 auto-light:border-black/10">
              <PlaceLogo place={place} className="size-8 rounded-lg text-sm" />
              <div className="min-w-0 flex-1">
                <Dialog.Title className="truncate text-sm font-semibold text-white auto-light:text-neutral-950">
                  {place.name}
                </Dialog.Title>
                <p className="text-xs text-neutral-500">
                  {dayjs(date).format('dddd D MMM')} ·{' '}
                  {team ? `${team.mine} mine / ${team.total} total` : '…'}
                </p>
              </div>
              <Dialog.Close
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-md text-neutral-500 hover:bg-white/[0.06] hover:text-neutral-200 auto-light:hover:bg-black/[0.06] auto-light:hover:text-neutral-800"
              >
                <Icon name="close" className="text-[18px]" />
              </Dialog.Close>
            </div>
            <div className="quiet-scrollbar flex-1 overflow-y-auto p-3">
              {!team ? (
                <div className="flex flex-col gap-2 p-1">
                  {[0, 1].map((i) => (
                    <div
                      key={i}
                      className="h-16 animate-pulse rounded-xl bg-white/[0.04] auto-light:bg-black/[0.04]"
                    />
                  ))}
                </div>
              ) : !team.people.length ? (
                <p className="px-2 py-1.5 text-sm text-neutral-500">
                  No tasks in this project on this day yet.
                </p>
              ) : (
                team.people.map((person) => (
                  <PersonTasks
                    key={person.id}
                    person={person}
                    date={date}
                    isMe={person.id === myId}
                  />
                ))
              )}
            </div>
          </>
        )}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

const TaskLine = ({ t, date }: { t: TeamTask; date: string }) => (
  <li className="flex items-start gap-2 rounded-lg px-2 py-1.5">
    <StatusIcon status={statusOf(t)} className="mt-[3px] text-[16px]" />
    <span
      className={cn(
        'min-w-0 flex-1 text-[13px] leading-5 text-neutral-200 auto-light:text-neutral-800',
        t.status === 'DONE' && 'text-neutral-500 auto-light:text-neutral-500',
      )}
    >
      {t.title}
    </span>
    {t.forDate && t.forDate !== date && (
      <span className="mt-0.5 shrink-0 text-[11px] tabular-nums text-neutral-500">
        {dayjs(t.forDate).format('ddd D MMM')}
      </span>
    )}
  </li>
);

/** One person's tasks on the day, and what they have coming up. */
const PersonTasks = ({
  person,
  date,
  isMe,
}: {
  person: ProjectTeam['people'][number];
  date: string;
  isMe: boolean;
}) => {
  const [more, setMore] = useState(false);
  const onDay = person.tasks.filter((t) => !t.upcoming);
  const upcoming = person.tasks
    .filter((t) => t.upcoming)
    .sort((a, b) => (a.forDate ?? '').localeCompare(b.forDate ?? ''));
  const done = onDay.filter((t) => t.status === 'DONE').length;
  return (
    <section className="mb-4">
      <div className="mb-1 flex items-center gap-2 px-1">
        <PersonAvatar
          name={person.name}
          avatar={person.avatar}
          className="size-6"
        />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-white auto-light:text-neutral-950">
          {isMe ? 'You' : person.name}
        </h3>
        <span className="text-[11px] tabular-nums text-neutral-500">
          {done}/{onDay.length} done
        </span>
      </div>
      <ul className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-1 auto-light:border-black/10 auto-light:bg-white">
        {onDay.map((t) => (
          <TaskLine key={t.id} t={t} date={date} />
        ))}
        {!onDay.length && (
          <li className="px-2 py-1.5 text-[12px] text-neutral-500">
            Nothing on this day.
          </li>
        )}
        {more && upcoming.length > 0 && (
          <>
            <li className="mx-2 mt-1 border-t border-white/[0.06] pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 auto-light:border-black/[0.06]">
              Coming up
            </li>
            {upcoming.map((t) => (
              <TaskLine key={t.id} t={t} date={date} />
            ))}
          </>
        )}
        {upcoming.length > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setMore((m) => !m)}
              className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left text-[12px] text-neutral-500 hover:bg-white/[0.04] hover:text-neutral-200 auto-light:hover:bg-black/[0.04] auto-light:hover:text-neutral-800"
            >
              <Icon
                name={more ? 'expand_less' : 'expand_more'}
                className="text-[16px]"
              />
              {more ? 'Hide upcoming' : `+${upcoming.length} more coming up`}
            </button>
          </li>
        )}
      </ul>
    </section>
  );
};
