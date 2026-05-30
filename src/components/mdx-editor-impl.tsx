'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  MDXEditor,
  type MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  linkPlugin,
  linkDialogPlugin,
  imagePlugin,
  tablePlugin,
  codeBlockPlugin,
  markdownShortcutPlugin,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  CreateLink,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  Separator,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import { cn } from '@/lib/utils';

// Markdown editor with a live formatted preview as you type. Backed by
// MDXEditor (Lexical). Markdown remains the source of truth — the editor
// parses on mount and serializes on change. The renderer (react-markdown)
// continues to own the read paths.

type Props = {
  value: string;
  onChange: (markdown: string) => void;
  editable?: boolean;
  /** Extra classes on the outer wrapper. */
  className?: string;
};

export function MdxEditor({
  value,
  onChange,
  editable = true,
  className,
}: Props) {
  const ref = useRef<MDXEditorMethods>(null);

  // MDXEditor fires onChange synchronously on every keystroke. Propagating
  // that straight into a parent form's state causes the editor subtree to
  // reconcile on every key, which is noticeable in dev mode. Debounce by
  // ~150ms; flush immediately on blur so a "save" click never reads stale.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const latestMdRef = useRef(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = useCallback((md: string) => {
    latestMdRef.current = md;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChangeRef.current(latestMdRef.current);
      debounceRef.current = null;
    }, 150);
  }, []);

  const flush = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      onChangeRef.current(latestMdRef.current);
    }
  }, []);

  return (
    <div
      onBlur={flush}
      className={cn(
        'rounded-md border border-input bg-card text-sm focus-within:border-ring focus-within:ring-1 focus-within:ring-ring',
        // MDXEditor reads its own design tokens (--accent*, --base*). We
        // pipe them through our brand palette so the editor inherits both
        // the bronze accent AND the light/dark shell — without this the
        // editor would render its default slate palette regardless of
        // theme, which is what created the dark-mode regression.
        '[--accentBase:var(--color-primary)] [--accentBgSubtle:color-mix(in_oklch,var(--color-primary)_10%,transparent)] [--accentLine:var(--color-border)] [--accentBorder:var(--color-border)] [--accentBorderHover:var(--color-border)] [--accentSolid:var(--color-primary)] [--accentSolidHover:var(--color-primary)] [--accentText:var(--color-primary)] [--accentTextContrast:var(--color-primary-foreground)]',
        '[--baseBase:var(--color-background)] [--baseBg:var(--color-card)] [--baseBgSubtle:var(--color-muted)] [--baseBgHover:var(--color-muted)] [--baseBgActive:var(--color-accent)] [--baseLine:var(--color-border)] [--baseBorder:var(--color-border)] [--baseBorderHover:var(--color-border)] [--baseSolid:var(--color-foreground)] [--baseSolidHover:var(--color-foreground)] [--baseText:var(--color-foreground)] [--baseTextContrast:var(--color-foreground)]',
        className,
      )}
    >
      <MDXEditor
        ref={ref}
        markdown={value}
        onChange={handleChange}
        readOnly={!editable}
        contentEditableClassName={cn(
          'prose prose-sm max-w-none px-4 py-3',
          // Every prose element pinned to theme tokens so the editable
          // content shifts with the shell instead of staying slate-y.
          'prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground',
          'prose-p:leading-relaxed prose-p:text-foreground',
          'prose-strong:text-foreground prose-em:text-foreground',
          'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
          'prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.875em] prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none',
          'prose-pre:bg-muted prose-pre:text-foreground',
          'prose-blockquote:border-l-4 prose-blockquote:border-primary/40 prose-blockquote:bg-muted/40 prose-blockquote:py-1 prose-blockquote:px-3 prose-blockquote:not-italic prose-blockquote:text-foreground',
          'prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:text-foreground marker:text-muted-foreground',
          'prose-hr:border-border',
          'focus:outline-none',
        )}
        plugins={[
          headingsPlugin({ allowedHeadingLevels: [1, 2, 3, 4] }),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          imagePlugin(),
          tablePlugin(),
          codeBlockPlugin({ defaultCodeBlockLanguage: 'text' }),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <>
                <UndoRedo />
                <Separator />
                <BoldItalicUnderlineToggles />
                <Separator />
                <BlockTypeSelect />
                <Separator />
                <ListsToggle />
                <Separator />
                <CreateLink />
                <InsertImage />
                <InsertTable />
                <InsertThematicBreak />
              </>
            ),
          }),
        ]}
      />
      <style jsx>{`
        /* Toolbar styling kept — matches our brand palette and lets
         * buttons wrap to a second row on narrow viewports. All
         * editor-content sizing is left to MDXEditor's defaults. */
        :global(.mdxeditor-toolbar) {
          border-bottom: 1px solid var(--color-border);
          background: var(--color-card);
          flex-wrap: wrap;
          gap: 4px;
        }
        /* Toolbar buttons: pin to theme tokens so the bold/italic/list
         * icons and their hover surfaces inherit the bronze brand
         * instead of MDXEditor's default slate palette. Selectors
         * cover the various button + select shapes the toolbar emits. */
        :global(.mdxeditor-toolbar button),
        :global(.mdxeditor-toolbar [role='button']),
        :global(.mdxeditor-toolbar select) {
          color: var(--color-foreground);
          background: transparent;
        }
        :global(.mdxeditor-toolbar button:hover),
        :global(.mdxeditor-toolbar [role='button']:hover) {
          background: var(--color-muted);
          color: var(--color-foreground);
        }
        :global(.mdxeditor-toolbar button[data-state='on']),
        :global(.mdxeditor-toolbar button[aria-pressed='true']) {
          background: color-mix(in oklch, var(--color-primary) 15%, transparent);
          color: var(--color-primary);
        }
        :global(.mdxeditor-toolbar svg) {
          color: currentColor;
          fill: currentColor;
        }
        :global(.mdxeditor-toolbar select),
        :global(.mdxeditor-toolbar [role='combobox']) {
          border: 1px solid var(--color-border);
          background: var(--color-card);
          color: var(--color-foreground);
        }
        /* Separator lines between button groups should follow border. */
        :global(.mdxeditor-toolbar [data-orientation='vertical']) {
          background: var(--color-border);
        }
      `}</style>
    </div>
  );
}
