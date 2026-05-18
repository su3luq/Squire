import { Children, isValidElement, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Markdown renderer used by:
//   - Card editor preview pane (Phase 2 commit #4 — this commit)
//   - Student card detail modal (Phase 2 commit #6)
//
// Wraps react-markdown + remark-gfm. Raw HTML is disabled (no rehype-raw).
// Custom component map:
//   - <p> intercepts single-link paragraphs whose URL is embeddable
//     (YouTube watch/short/embed/youtu.be, or a direct video file URL)
//     and replaces the paragraph with the corresponding embed.
//   - <a> external links get target=_blank + rel=noopener noreferrer.
//   - <img> bails on empty src (prevents the empty-src warning while
//     the user is mid-typing `![alt]()`), lazy-loaded.

// ---- URL detection helpers ----

function parseYouTubeId(href: string): { id: string; start?: number } | null {
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./, '');
    let id: string | null = null;

    if (host === 'youtu.be') {
      id = u.pathname.slice(1).split('/')[0] || null;
    } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') {
        id = u.searchParams.get('v');
      } else {
        const m = u.pathname.match(/^\/(embed|shorts)\/([^/?#]+)/);
        if (m) id = m[2];
      }
    }

    if (!id) return null;

    const tParam = u.searchParams.get('t') ?? u.searchParams.get('start');
    const start = tParam ? parseTimeParam(tParam) : undefined;
    return { id, start };
  } catch {
    return null;
  }
}

// Accept either a plain seconds count (`120`) or YouTube's "1m30s" / "1h2m3s" style.
function parseTimeParam(t: string): number | undefined {
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const m = t.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  if (!m) return undefined;
  const h = parseInt(m[1] ?? '0', 10);
  const min = parseInt(m[2] ?? '0', 10);
  const s = parseInt(m[3] ?? '0', 10);
  const total = h * 3600 + min * 60 + s;
  return total > 0 ? total : undefined;
}

function isDirectVideoUrl(href: string): boolean {
  try {
    const u = new URL(href);
    return /\.(mp4|webm|ogv|mov|m4v)(\?.*)?$/i.test(u.pathname);
  } catch {
    return false;
  }
}

// ---- Embed components ----

function YouTubeEmbed({ videoId, start }: { videoId: string; start?: number }) {
  const src = start
    ? `https://www.youtube.com/embed/${videoId}?start=${start}`
    : `https://www.youtube.com/embed/${videoId}`;
  return (
    <div className="my-4 aspect-video w-full overflow-hidden rounded-md border border-slate-200 bg-black">
      <iframe
        src={src}
        title="YouTube video"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="h-full w-full"
      />
    </div>
  );
}

function VideoEmbed({ src }: { src: string }) {
  return (
    <video
      controls
      preload="metadata"
      src={src}
      className="my-4 w-full rounded-md border border-slate-200 bg-black"
    />
  );
}

// ---- Component map ----

// Get the href of the only-child link inside a paragraph, if any.
//
// Note we don't check `only.type === 'a'`: react-markdown renders link nodes
// through our custom `a` component (defined below), so by the time the `p`
// component sees the child, its type is our component function — not the
// string 'a'. Instead we just look for an href prop, which is the unique
// signal of a link node in react-markdown's output.
function singleLinkHref(children: ReactNode): string | null {
  const arr = Children.toArray(children).filter(
    (c) => !(typeof c === 'string' && c.trim() === '')
  );
  if (arr.length !== 1) return null;
  const only = arr[0];
  if (!isValidElement(only)) return null;
  const props = only.props as { href?: unknown };
  return typeof props.href === 'string' ? props.href : null;
}

const components: Components = {
  p: ({ children, ...props }) => {
    const href = singleLinkHref(children);
    if (href) {
      const yt = parseYouTubeId(href);
      if (yt) return <YouTubeEmbed videoId={yt.id} start={yt.start} />;
      if (isDirectVideoUrl(href)) return <VideoEmbed src={href} />;
    }
    return <p {...props}>{children}</p>;
  },
  a: ({ href, children, ...props }) => {
    const isExternal = typeof href === 'string' && /^https?:\/\//i.test(href);
    return (
      <a
        href={href}
        {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        {...props}
      >
        {children}
      </a>
    );
  },
  img: ({ src, alt }) => {
    if (!src || (typeof src === 'string' && src.trim() === '')) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt ?? ''}
        loading="lazy"
        className="max-w-full rounded-md"
      />
    );
  },
};

// Prose modifiers tuned for our slate palette. `prose-sm` for compact rendering.
const PROSE_CLASSES = [
  'prose prose-slate prose-sm max-w-none',
  'prose-headings:font-semibold prose-headings:text-slate-900',
  'prose-h1:text-3xl prose-h1:mt-0 prose-h1:mb-3 prose-h1:border-b prose-h1:border-slate-200 prose-h1:pb-2',
  'prose-h2:text-2xl prose-h2:mb-2 prose-h2:border-b prose-h2:border-slate-100 prose-h2:pb-1',
  'prose-h3:text-xl prose-h3:mb-2',
  'prose-h4:text-lg',
  'prose-p:text-slate-700 prose-p:leading-relaxed',
  'prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline',
  'prose-strong:text-slate-900 prose-em:text-slate-700',
  'prose-code:rounded prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.875em] prose-code:font-mono prose-code:text-slate-800 prose-code:before:content-none prose-code:after:content-none',
  'prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-pre:rounded-md',
  'prose-blockquote:border-l-4 prose-blockquote:border-blue-300 prose-blockquote:bg-blue-50/40 prose-blockquote:py-1 prose-blockquote:px-3 prose-blockquote:not-italic prose-blockquote:text-slate-700',
  'prose-hr:border-slate-200',
  'prose-table:border prose-table:border-slate-200',
  'prose-th:bg-slate-50 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold',
  'prose-td:border-t prose-td:border-slate-200 prose-td:px-3 prose-td:py-2',
  'prose-ul:my-3 prose-ol:my-3 prose-li:my-1',
  'prose-img:rounded-md prose-img:border prose-img:border-slate-200',
].join(' ');

export function MarkdownRenderer({
  source,
  emptyPlaceholder,
}: {
  source: string;
  emptyPlaceholder?: string;
}) {
  if (!source.trim()) {
    if (emptyPlaceholder === undefined) return null;
    return <p className="text-sm italic text-slate-400">{emptyPlaceholder}</p>;
  }
  return (
    <div className={PROSE_CLASSES}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
