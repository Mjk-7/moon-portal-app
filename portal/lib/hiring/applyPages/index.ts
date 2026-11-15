import { filmSlatePage } from './film-slate';
import type { ApplyPageConfig } from './types';

export type { ApplyPageConfig } from './types';

/** Designed apply pages an opening can use instead of the standard one, by key. */
export const APPLY_PAGES: Record<string, ApplyPageConfig> = {
  [filmSlatePage.key]: filmSlatePage,
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * The video id in a YouTube link (watch, youtu.be, shorts, embed or live),
 * or null when it is not one.
 */
export function youtubeId(link: string | null | undefined): string | null {
  if (!link) return null;
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, first, second] = url.pathname.split('/');
    id =
      first === 'watch'
        ? url.searchParams.get('v')
        : ['shorts', 'embed', 'live', 'v'].includes(first ?? '')
          ? (second ?? null)
          : null;
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** The privacy-friendly player for a YouTube link, or null. */
export function youtubeEmbedUrl(link: string | null | undefined) {
  const id = youtubeId(link);
  return id
    ? `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`
    : null;
}
