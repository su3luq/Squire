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
    <div className="my-4 aspect-video w-full overflow-hidden rounded-md border border-border bg-black">
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
      className="my-4 w-full rounded-md border border-border bg-black"
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

// Prose modifiers tuned to our theme tokens so the renderer adapts to
// both light + dark modes without a separate dark stylesheet. Every
// color reference goes through CSS variables (theme tokens) — no
// hardcoded slate/blue/etc., so the same prose surface reads correctly
// when the .dark class flips.
const PROSE_CLASSES = [
  'prose prose-sm max-w-none',
  // Mobile/tablet overflow guard: break long words and constrain inline media
  // so tables, images, and code blocks don't burst out of their container.
  '[overflow-wrap:break-word] [word-break:break-word]',
  '[&_table]:block [&_table]:w-max [&_table]:max-w-full [&_table]:overflow-x-auto',
  '[&_pre]:max-w-full [&_pre]:overflow-x-auto',
  // Headings inherit the theme foreground so they shift with light/dark.
  'prose-headings:font-semibold prose-headings:text-foreground',
  'prose-h1:text-3xl prose-h1:mt-0 prose-h1:mb-3 prose-h1:border-b prose-h1:border-border prose-h1:pb-2',
  'prose-h2:text-2xl prose-h2:mb-2 prose-h2:border-b prose-h2:border-border prose-h2:pb-1',
  'prose-h3:text-xl prose-h3:mb-2',
  'prose-h4:text-lg',
  // Body copy uses foreground; muted for slight de-emphasis where needed.
  'prose-p:text-foreground prose-p:leading-relaxed',
  'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
  'prose-strong:text-foreground prose-em:text-foreground',
  // List markers (the "1." "2." in ordered lists, bullets in ul) need an
  // explicit color or they fall back to the user-agent default which is
  // off in dark mode. marker:* applies to the ::marker pseudo.
  'prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:text-foreground marker:text-muted-foreground',
  // Code: subtle muted background, foreground text.
  'prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.875em] prose-code:font-mono prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none',
  'prose-pre:bg-muted prose-pre:text-foreground prose-pre:rounded-md',
  'prose-blockquote:border-l-4 prose-blockquote:border-primary/40 prose-blockquote:bg-muted/40 prose-blockquote:py-1 prose-blockquote:px-3 prose-blockquote:not-italic prose-blockquote:text-foreground',
  'prose-hr:border-border',
  'prose-table:border prose-table:border-border',
  'prose-th:bg-muted prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-th:text-foreground',
  'prose-td:border-t prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-foreground',
  'prose-img:rounded-md prose-img:border prose-img:border-border prose-img:max-w-full prose-img:h-auto',
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
    return <p className="text-sm italic text-muted-foreground/70">{emptyPlaceholder}</p>;
  }
  return (
    <div className={PROSE_CLASSES}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
