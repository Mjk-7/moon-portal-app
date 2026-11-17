import { NextResponse } from 'next/server';

import { runWinsCron } from '@/lib/wins/scheduled';

export const dynamic = 'force-dynamic';

/**
 * The evening wins run (lib/wins/scheduled.ts): "one more for this week's
 * goal" nudges and the Friday recap. vercel.json runs it daily at 12:30 UTC
 * (18:00 IST). When CRON_SECRET is set, other callers are refused.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ status: 'success', data: await runWinsCron() });
}
