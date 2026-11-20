import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

/*
 * Markdown to HTML for onboarding documents and course lessons. Raw HTML in
 * the Markdown is dropped (remark-rehype leaves it out), and links keep only
 * web, mail and in-page targets, so the result is safe to render.
 */

const SAFE_HREF = /^(https?:|mailto:|#|\/)/i;

const safeLinks = () => (tree: any) => {
  visit(tree, 'element', (node: any) => {
    if (node.tagName !== 'a') return;
    const href = String(node.properties?.href ?? '');
    if (!SAFE_HREF.test(href)) delete node.properties.href;
    else if (/^https?:/i.test(href)) {
      node.properties.target = '_blank';
      node.properties.rel = 'noreferrer';
    }
  });
};

// A new line in a paragraph is a line break, as people writing a letter
// expect ("Prepared for … / on …"), not a space.
const lineBreaks = () => (tree: any) => {
  visit(tree, 'text', (node: any, index: number | undefined, parent: any) => {
    if (!parent || index === undefined || !node.value.includes('\n')) return;
    const out: any[] = [];
    node.value.split(/\r?\n/).forEach((part: string, i: number) => {
      if (i) out.push({ type: 'break' });
      if (part) out.push({ type: 'text', value: part });
    });
    parent.children.splice(index, 1, ...out);
    return index + out.length;
  });
};

/** A YouTube, Vimeo or Loom link as an embeddable player address. */
export function videoEmbedUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^(www\.|m\.)/, '').toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  const ID = /^[A-Za-z0-9_-]{6,20}$/;

  if (
    host === 'youtube.com' ||
    host === 'youtu.be' ||
    host === 'youtube-nocookie.com'
  ) {
    let id: string | null = null;
    if (host === 'youtu.be') id = parts[0] ?? null;
    else if (parts[0] === 'watch') id = url.searchParams.get('v');
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0] ?? ''))
      id = parts[1] ?? null;
    if (!id || !ID.test(id)) return null;
    // ?t=90, ?t=1m30s or ?start=90
    const t = url.searchParams.get('t') ?? url.searchParams.get('start');
    let start = 0;
    if (t) {
      const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(t);
      if (m) start = +(m[1] ?? 0) * 3600 + +(m[2] ?? 0) * 60 + +(m[3] ?? 0);
    }
    return `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}`;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = parts.find((p) => /^\d{5,12}$/.test(p));
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (host === 'loom.com') {
    const id = parts[0] === 'share' || parts[0] === 'embed' ? parts[1] : null;
    return id && /^[a-f0-9]{16,40}$/i.test(id)
      ? `https://www.loom.com/embed/${id}`
      : null;
  }
  return null;
}

const isBlank = (n: any) =>
  (n.type === 'text' && !String(n.value).trim()) ||
  (n.type === 'element' && n.tagName === 'br');

// A paragraph that is only a video link (a pasted YouTube URL on its own
// line) becomes a player. Only the iframe this builds is let through, never
// raw HTML from the Markdown.
const videoEmbeds = () => (tree: any) => {
  visit(
    tree,
    'element',
    (node: any, index: number | undefined, parent: any) => {
      if (node.tagName !== 'p' || !parent || index === undefined) return;
      const kids = (node.children ?? []).filter((c: any) => !isBlank(c));
      if (kids.length !== 1) return;
      const link = kids[0];
      if (link.type !== 'element' || link.tagName !== 'a') return;
      const src = videoEmbedUrl(String(link.properties?.href ?? ''));
      if (!src) return;
      const label = (link.children ?? [])
        .map((c: any) => (c.type === 'text' ? c.value : ''))
        .join('')
        .trim();
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['doc-video'] },
        children: [
          {
            type: 'element',
            tagName: 'iframe',
            properties: {
              src,
              title: label && !/^https?:/i.test(label) ? label : 'Video',
              loading: 'lazy',
              allow:
                'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
              allowFullScreen: true,
              referrerPolicy: 'strict-origin-when-cross-origin',
              frameBorder: '0',
            },
            children: [],
          },
        ],
      };
    },
  );
};

const base = () =>
  unified().use(remarkParse).use(remarkGfm).use(lineBreaks).use(remarkRehype);

const processor = base().use(safeLinks).use(rehypeStringify);
const withVideos = base().use(videoEmbeds).use(safeLinks).use(rehypeStringify);

/**
 * `embeds` turns video links on their own line into players (course
 * lessons). Agreements leave it off: a signed document stays plain text.
 */
export function markdownToHtml(
  markdown: string,
  options: { embeds?: boolean } = {},
): string {
  try {
    return String(
      (options.embeds ? withVideos : processor).processSync(markdown ?? ''),
    );
  } catch {
    return '';
  }
}
