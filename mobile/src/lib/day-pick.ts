/*
 * The day picked on the Work tab's calendar sheet (app/work-calendar.tsx),
 * handed back to the Work tab, which listens while it is mounted.
 */

const listeners = new Set<(day: string) => void>();

/** Called by the Work tab: runs `listener` with each picked day. */
export function onDayPicked(listener: (day: string) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Called by the calendar sheet when a day is picked. */
export function pickDay(day: string) {
  listeners.forEach((l) => l(day));
}
