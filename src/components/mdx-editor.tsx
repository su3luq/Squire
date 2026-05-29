'use client';

import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';

// Thin dynamic-import wrapper around the real MDXEditor component.
//
// MDXEditor pulls Lexical + a stack of plugins (~hundreds of KB gzipped).
// We don't want that in the initial bundle of any page that *might* show
// an editor — only the pages that actually mount one.
//
// Splitting the wrapper from the implementation (mdx-editor-impl.tsx)
// lets `next/dynamic` defer the heavy module until render. SSR is off
// because MDXEditor relies on browser-only APIs.

type Props = {
  value: string;
  onChange: (markdown: string) => void;
  editable?: boolean;
  className?: string;
};

const MdxEditorInner = dynamic<Props>(
  () => import('./mdx-editor-impl').then((m) => m.MdxEditor),
  {
    ssr: false,
    loading: () => (
      <div
        className={cn(
          'flex min-h-32 items-center justify-center rounded-md border border-input bg-card text-xs text-muted-foreground',
        )}
        aria-busy="true"
      >
        Loading editor…
      </div>
    ),
  },
);

export function MdxEditor(props: Props) {
  return <MdxEditorInner {...props} />;
}
