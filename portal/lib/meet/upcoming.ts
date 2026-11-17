import { db } from '@/lib/mongodb/db-client';
import { MEET_BOOKING_STATUS, type MeetBooking } from '@/models/meet';

import { joinLink } from './links';
import { meetingClock } from './meetingTasks';
import { hostName } from './server';

/*
 * A person's confirmed meetings in the coming days, hosting or as a guest
 * with a portal account. The phone app and the website set their meeting
 * reminders from this (15 minutes before, and when it starts), so it does
 * not depend on the meeting's worklog task still being open.
 */

const AHEAD_DAYS = 7;
/** Meetings that started this long ago are still listed (for "starting now"). */
const BEHIND_MINUTES = 30;
const MAX = 50;

export type UpcomingMeeting = {
  bookingId: string;
  /** ISO times. */
  start: string;
  end: string;
  /** "14:30–15:00" in the person's timezone. */
  time: string;
  /** Who they meet. */
  with: string;
  interview: boolean;
  hosting: boolean;
  /** The portal's join link, relative. */
  joinUrl: string | null;
  /** The meeting on the Meet page. */
  url: string;
};

type Person = {
  id: string;
  email?: string | null;
  googleEmail?: string | null;
  timezone?: string | null;
};

export async function upcomingMeetings(
  userId: string,
  now = new Date(),
): Promise<UpcomingMeeting[]> {
  const person: Person | null = await db.user.findFirst({
    where: { id: userId },
    select: { id: true, email: true, googleEmail: true, timezone: true },
  });
  if (!person) return [];
  const emails = Array.from(
    new Set(
      [person.email, person.googleEmail]
        .map((e) => e?.trim().toLowerCase())
        .filter((e): e is string => !!e),
    ),
  );
  const from = new Date(now.getTime() - BEHIND_MINUTES * 60_000).toISOString();
  const until = new Date(now.getTime() + AHEAD_DAYS * 86_400_000).toISOString();

  const bookings: MeetBooking[] = await db.meetBooking.findMany({
    where: {
      status: MEET_BOOKING_STATUS.CONFIRMED,
      start: { gte: from, lte: until },
      OR: [
        { hostId: userId },
        ...(emails.length ? [{ guestEmail: { in: emails } }] : []),
      ],
    },
    orderBy: { start: 'asc' },
    take: MAX,
  });
  if (!bookings.length) return [];

  const tz = person.timezone || 'UTC';
  const hostIds = Array.from(
    new Set(bookings.map((b) => b.hostId).filter((id) => id !== userId)),
  );
  const hosts: {
    id: string;
    name?: string | null;
    username?: string | null;
  }[] = hostIds.length
    ? await db.user.findMany({
        where: { id: { in: hostIds } },
        select: { id: true, name: true, username: true },
      })
    : [];
  const hostNames = new Map(hosts.map((h) => [h.id, hostName(h)]));

  return bookings.map((b) => {
    const hosting = b.hostId === userId;
    return {
      bookingId: b.id,
      start: b.start,
      end: b.end,
      time: meetingClock(b, tz),
      with: hosting ? b.guestName : (hostNames.get(b.hostId) ?? 'your host'),
      interview: !!b.applicationId,
      hosting,
      joinUrl: b.meetingUrl ? joinLink('', b, 'host') : null,
      url: `/meet?booking=${b.id}`,
    };
  });
}
