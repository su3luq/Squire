import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Minimal markdown preview. Used by the card editor preview pane in Phase 2 commit #3.
// Phase 2 commit #4 upgrades to a full <MarkdownRenderer /> with custom embed handling
// for YouTube/video URLs — at that point the editor preview swaps to use the renderer.
//
// Raw HTML is disabled by react-markdown's default; we don't pass rehype-raw.

export function MarkdownPreview({ source }: { source: string }) {
  if (!source.trim()) {
    return <p className="text-sm italic text-slate-400">Preview will appear here.</p>;
  }
  return (
    <div className="prose prose-slate prose-sm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}
