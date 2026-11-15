'use client';

import { useEffect, useState } from 'react';

import { THEME_KEY } from '@/lib/theme';
import { cn } from '@/lib/utils';

import { Icon } from '../screens/Admin/shared/AdminUI';

export type ThemeSetting = 'auto' | 'light' | 'dark';

const OPTIONS: { value: ThemeSetting; icon: string; label: string }[] = [
  { value: 'auto', icon: 'brightness_auto', label: 'Auto: follow this device' },
  { value: 'light', icon: 'light_mode', label: 'Day' },
  { value: 'dark', icon: 'dark_mode', label: 'Night' },
];

const read = (): ThemeSetting => {
  const set = document.documentElement.dataset.theme;
  return set === 'light' || set === 'dark' ? set : 'auto';
};

/**
 * Day, night or auto (the device's setting, the default) for the screens
 * that follow it (see lib/theme). The choice is kept on this browser.
 */
export const ThemeChoice = ({ className }: { className?: string }) => {
  const [theme, setTheme] = useState<ThemeSetting | null>(null);
  useEffect(() => setTheme(read()), []);
  const pick = (next: ThemeSetting) => {
    if (next === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    try {
      if (next === 'auto') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage can be blocked; the choice then lasts for this visit.
    }
    setTheme(next);
  };
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-white/[0.07] p-0.5 auto-light:border-black/10',
        className,
      )}
    >
      {OPTIONS.map((o) => {
        const on = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.label}
            title={o.label}
            onClick={() => pick(o.value)}
            className={cn(
              'flex size-7 items-center justify-center rounded-md transition-colors',
              on
                ? 'bg-white/[0.1] text-white auto-light:bg-black/[0.07] auto-light:text-neutral-950'
                : 'text-neutral-500 hover:text-neutral-200 auto-light:hover:text-neutral-800',
            )}
          >
            <Icon name={o.icon} className="text-[16px]" />
          </button>
        );
      })}
    </div>
  );
};

/**
 * While mounted, lets everything on the page follow the theme, including
 * menus and dialogs that open outside the screen's own element.
 */
export const useAutoThemeBody = () => {
  useEffect(() => {
    document.body.classList.add('auto-theme');
    return () => document.body.classList.remove('auto-theme');
  }, []);
};
