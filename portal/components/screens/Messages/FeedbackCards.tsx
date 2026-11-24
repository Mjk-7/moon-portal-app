'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';
import type { FeedbackCard } from '@/models/chat';

import { chatApi, type ChatConversation, type ChatMessage } from './api';
import { CatAvatar, Icon, Spin } from './parts';

/*
 * The Feedback Cat's pieces in a chat: its pixel avatar (with moods), the
 * welcome chips, the draft card with File it / Change buttons, and the
 * "thinking" bubble while Claude writes.
 */

export type FeedbackAction = 'file' | 'change' | 'discard';

const KIND_STYLE: Record<string, string> = {
  bug: 'bg-rose-500/15 text-rose-300 auto-light:bg-rose-100 auto-light:text-rose-700',
  error:
    'bg-red-500/15 text-red-300 auto-light:bg-red-100 auto-light:text-red-700',
  'feature request':
    'bg-sky-500/15 text-sky-300 auto-light:bg-sky-100 auto-light:text-sky-700',
  improvement:
    'bg-emerald-500/15 text-emerald-300 auto-light:bg-emerald-100 auto-light:text-emerald-700',
  design:
    'bg-violet-500/15 text-violet-300 auto-light:bg-violet-100 auto-light:text-violet-700',
  performance:
    'bg-amber-500/15 text-amber-300 auto-light:bg-amber-100 auto-light:text-amber-700',
};

const Tag = ({
  children,
  className,
}: {
  children: string;
  className?: string;
}) => (
  <span
    className={cn(
      'rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium auto-light:bg-black/[0.06]',
      className,
    )}
  >
    {children}
  </span>
);

const STATUS_LINE: Record<
  NonNullable<FeedbackCard['status']>,
  { icon: string; text: string; className: string } | null
> = {
  draft: null,
  filing: {
    icon: 'progress_activity',
    text: 'Sending…',
    className: 'opacity-70',
  },
  filed: {
    icon: 'check_circle',
    text: 'Filed',
    className: 'text-emerald-300 auto-light:text-emerald-700',
  },
  merged: {
    icon: 'add_reaction',
    text: 'Added as a +1',
    className: 'text-emerald-300 auto-light:text-emerald-700',
  },
  saved: {
    icon: 'inventory_2',
    text: 'Saved for the team',
    className: 'text-amber-300 auto-light:text-amber-700',
  },
  discarded: { icon: 'block', text: 'Dropped', className: 'opacity-60' },
};

/** The issue the cat is about to file, and what became of it. */
export const FeedbackDraft = ({
  message,
  onAction,
}: {
  message: ChatMessage;
  onAction: (message: ChatMessage, action: FeedbackAction) => Promise<void>;
}) => {
  const card = message.feedback!;
  const [busy, setBusy] = useState<FeedbackAction | null>(null);
  const status = card.status ?? 'draft';
  const line = STATUS_LINE[status];
  const act = async (action: FeedbackAction) => {
    setBusy(action);
    try {
      await onAction(message, action);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="mt-1.5 w-[min(340px,70vw)]">
      <div
        className={cn(
          'overflow-hidden rounded-lg border border-white/10 bg-black/25 auto-light:border-black/10 auto-light:bg-neutral-50',
          status === 'discarded' && 'opacity-60',
        )}
      >
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2 text-[11px] uppercase tracking-wider text-neutral-400 auto-light:border-black/[0.06] auto-light:text-neutral-500">
          <Icon name="bug_report" className="text-[15px]" />
          Draft issue
        </div>
        <div className="space-y-2 px-3 py-2.5">
          <p
            className={cn(
              'text-[15px] font-semibold leading-snug',
              status === 'discarded' && 'line-through',
            )}
          >
            {card.title}
          </p>
          {card.summary && (
            <p className="text-sm leading-snug opacity-80">{card.summary}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {card.kind && (
              <Tag className={KIND_STYLE[card.kind]}>{card.kind}</Tag>
            )}
            {card.area && <Tag>{card.area}</Tag>}
            {card.priority && <Tag>{card.priority}</Tag>}
          </div>
        </div>
        {status === 'draft' ? (
          <div className="flex border-t border-white/[0.06] auto-light:border-black/[0.06]">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => act('file')}
              className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-white/[0.05] disabled:opacity-60 auto-light:text-emerald-700 auto-light:hover:bg-black/[0.04]"
            >
              {busy === 'file' ? (
                <Spin />
              ) : (
                <Icon name="send" className="text-[17px]" />
              )}
              File it
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => act('change')}
              className="flex flex-1 items-center justify-center gap-1.5 border-l border-white/[0.06] py-2.5 text-sm font-medium hover:bg-white/[0.05] disabled:opacity-60 auto-light:border-black/[0.06] auto-light:hover:bg-black/[0.04]"
            >
              <Icon name="edit" className="text-[17px]" />
              Change
            </button>
            <button
              type="button"
              aria-label="Drop this draft"
              title="Drop this draft"
              disabled={!!busy}
              onClick={() => act('discard')}
              className="flex w-11 items-center justify-center border-l border-white/[0.06] text-neutral-400 hover:bg-white/[0.05] disabled:opacity-60 auto-light:border-black/[0.06] auto-light:hover:bg-black/[0.04]"
            >
              <Icon name="close" className="text-[18px]" />
            </button>
          </div>
        ) : line ? (
          <div
            className={cn(
              'flex items-center gap-1.5 border-t border-white/[0.06] px-3 py-2 text-sm font-medium auto-light:border-black/[0.06]',
              line.className,
            )}
          >
            <Icon
              name={line.icon}
              className={cn(
                'text-[17px]',
                status === 'filing' && 'animate-spin',
              )}
            />
            {line.text}
            {card.issueNumber && card.issueUrl && (
              <a
                href={card.issueUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto underline underline-offset-2"
              >
                #{card.issueNumber}
              </a>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

/** The welcome message's starters: tapping one sends its words. */
export const FeedbackChips = ({
  chips,
  onPick,
}: {
  chips: string[];
  onPick: (text: string) => void;
}) => (
  <div className="mt-2 flex flex-wrap gap-1.5">
    {chips.map((chip) => (
      <button
        key={chip}
        type="button"
        onClick={() => onPick(chip)}
        className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[13px] font-medium text-amber-200 transition-colors hover:bg-amber-400/20 auto-light:border-amber-500/40 auto-light:bg-amber-50 auto-light:text-amber-800 auto-light:hover:bg-amber-100"
      >
        {chip}
      </button>
    ))}
  </div>
);

/** "The cat is thinking", at the bottom of the chat while Claude writes. */
export const CatThinking = () => (
  <div className="mt-2 flex items-end gap-2 px-3 md:px-[6%]">
    <CatAvatar size={28} mood="thinking" />
    <div className="flex items-center gap-1 rounded-xl rounded-bl-sm bg-neutral-800 px-3 py-2.5 shadow-sm auto-light:bg-white">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce rounded-full bg-neutral-400"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  </div>
);

/** Opens (or makes) the person's chat with the cat, noting where they were. */
export async function openFeedbackChat(page?: string | null) {
  const { conversation } = await chatApi<{ conversation: ChatConversation }>(
    '/api/chat/feedback',
    'POST',
    {
      platform: 'web',
      page: page ?? null,
      screen:
        typeof window !== 'undefined'
          ? `${window.innerWidth}x${window.innerHeight}`
          : null,
    },
  );
  return conversation;
}
