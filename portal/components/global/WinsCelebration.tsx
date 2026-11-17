'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useUser } from '@/utils/hooks/useUser';

/*
 * The celebration card: wins (goals met, streaks, levels, badges, big
 * tasks; see lib/wins) the person hasn't seen yet pop up with a burst of
 * confetti the next time the portal is open. Several step through one by
 * one; closing marks them seen, here and in the app.
 */

type WinCard = {
  id: string;
  emoji: string;
  title: string;
  body: string;
  url: string;
};

const CHECK_EVERY_MS = 60_000;
const COLORS = [
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#ef4444',
  '#a855f7',
  '#ec4899',
];

const Confetti = () => {
  const pieces = Array.from({ length: 28 }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-2 h-0 overflow-visible">
      {pieces.map((i) => {
        const left = (i * 37) % 100;
        const delay = (i % 7) * 60;
        const drift = ((i * 53) % 80) - 40;
        return (
          <span
            key={i}
            className="wins-confetti absolute block h-2 w-1.5 rounded-sm"
            style={
              {
                left: `${left}%`,
                background: COLORS[i % COLORS.length],
                animationDelay: `${delay}ms`,
                '--drift': `${drift}px`,
              } as React.CSSProperties
            }
          />
        );
      })}
      <style>{`
        @keyframes wins-confetti {
          0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate(var(--drift), -140px) rotate(540deg); opacity: 0; }
        }
        .wins-confetti { animation: wins-confetti 1.4s ease-out forwards; }
        @media (prefers-reduced-motion: reduce) { .wins-confetti { display: none; } }
      `}</style>
    </div>
  );
};

export const WinsCelebration = () => {
  const { user } = useUser();
  const userId = user?.id;
  const [wins, setWins] = useState<WinCard[]>([]);
  const [index, setIndex] = useState(0);
  const lastCheck = useRef(0);
  const showing = wins.length > 0;

  const load = useCallback(async () => {
    if (Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
    lastCheck.current = Date.now();
    try {
      const res = await fetch('/api/me/wins', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      const list: WinCard[] = json?.data?.wins ?? [];
      if (list.length) {
        setWins((current) => (current.length ? current : list));
        setIndex(0);
      }
    } catch {
      // Offline: try again later.
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    void load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId, load]);

  const close = useCallback(() => {
    const seen = wins.map((w) => w.id);
    setWins([]);
    setIndex(0);
    void fetch('/api/me/wins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seen }),
    }).catch(() => null);
  }, [wins]);

  useEffect(() => {
    if (!showing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showing, close]);

  if (!showing) return null;
  const win = wins[Math.min(index, wins.length - 1)];
  const last = index >= wins.length - 1;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-6 z-[1400] mx-auto max-w-sm sm:inset-x-auto sm:right-6"
    >
      <div
        key={win.id}
        className="relative rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <Confetti />
        <div className="flex items-start gap-3">
          <div className="text-4xl leading-none" aria-hidden>
            {win.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-neutral-900 dark:text-white">
              {win.title}
            </p>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
              {win.body}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-xs text-neutral-400">
            {wins.length > 1 ? `${index + 1} of ${wins.length}` : ''}
          </span>
          <div className="flex gap-2">
            {win.url && (
              <Link
                href={win.url}
                onClick={close}
                className="rounded-full px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                View
              </Link>
            )}
            <button
              type="button"
              onClick={() => (last ? close() : setIndex((i) => i + 1))}
              className="rounded-full bg-neutral-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
            >
              {last ? 'Nice!' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
