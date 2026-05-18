import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Minimal markdown preview used by the card editor preview pane (Phase 2 commit #3).
// Phase 2 commit #4 upgrades to a full <MarkdownRenderer /> with YouTube/video embeds.
//
// Raw HTML is disabled by react-markdown's default; we don't pass rehype-raw.

// Defensive img: bail out when src is empty (prevents the empty-src warning when
// the user is mid-typing `![alt]()`).
const components: Components = {
  img: ({ src, alt }) => {
    if (!src || (typeof src === 'string' && src.trim() === '')) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt ?? ''} loading="lazy" className="max-w-full rounded-md" />
    );
  },
};

// Prose modifiers tuned for our slate palette. `prose-sm` for compact card-body rendering.
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

export function MarkdownPreview({ source }: { source: string }) {
  if (!source.trim()) {
    return <p className="text-sm italic text-slate-400">Preview will appear here.</p>;
  }
  return (
    <div className={PROSE_CLASSES}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
