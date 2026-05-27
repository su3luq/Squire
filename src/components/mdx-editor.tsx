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
  /**
   * Minimum height of the editing area. Defaults to a solid `400px` so the
   * editor never looks like a one-line textarea. Override per surface
   * (e.g. shorter for feedback / notes, longer for essays).
   */
  minHeight?: string;
  /** Extra classes on the outer wrapper. */
  className?: string;
};

export function MdxEditor({
  value,
  onChange,
  editable = true,
  minHeight = '400px',
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

  // MDXEditor only treats clicks inside its contentEditable as text input;
  // the surrounding padding doesn't reach the cursor. When the user clicks
  // anywhere in the editor's white area, forward focus to the contentEditable
  // element so the cursor lands there.
  const focusEditor = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!editable) return;
    // If the user already clicked inside the contentEditable, do nothing
    // (otherwise we'd disturb the natural caret placement).
    const target = e.target as HTMLElement;
    if (target.closest('[contenteditable="true"]')) return;
    if (target.closest('.mdxeditor-toolbar')) return;
    const root = e.currentTarget.querySelector<HTMLElement>(
      '[contenteditable="true"]',
    );
    if (root) root.focus();
  }, [editable]);

  return (
    <div
      onBlur={flush}
      onMouseDown={focusEditor}
      className={cn(
        'rounded-md border border-input bg-card text-sm focus-within:border-ring focus-within:ring-1 focus-within:ring-ring',
        editable && 'cursor-text',
        // The shipped MDXEditor stylesheet uses its own design tokens. We
        // pull them into our brand palette where it matters most.
        '[--accentBase:var(--color-primary)] [--accentBgSubtle:color-mix(in_oklch,var(--color-primary)_10%,transparent)] [--accentLine:var(--color-border)] [--accentBorder:var(--color-border)] [--accentBorderHover:var(--color-border)] [--accentSolid:var(--color-primary)] [--accentSolidHover:var(--color-primary)] [--accentText:var(--color-primary)] [--accentTextContrast:var(--color-primary-foreground)]',
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
          'prose-headings:font-semibold prose-headings:tracking-tight',
          'prose-p:leading-relaxed',
          'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
          'prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.875em] prose-code:before:content-none prose-code:after:content-none',
          'prose-pre:bg-muted prose-pre:text-foreground',
          'prose-blockquote:border-l-4 prose-blockquote:border-primary/30 prose-blockquote:bg-muted/40 prose-blockquote:py-1 prose-blockquote:px-3 prose-blockquote:not-italic prose-blockquote:text-foreground',
          'prose-ul:my-3 prose-ol:my-3 prose-li:my-1',
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
        /*
         * Put min-height on the contenteditable element itself, not on
         * its container. MDXEditor's DOM is:
         *   .mdxeditor-root-contenteditable > div > [contenteditable]
         * If we size only the outer wrapper, the contenteditable stays
         * as short as the text, so clicks below the text land on the
         * wrapper — the cursor lands at line 0 instead of where the
         * user clicked. Sizing the contenteditable makes it fill the
         * visible area, so Lexical places the caret at the last
         * paragraph wherever the user clicks.
         */
        :global(.mdxeditor-root-contenteditable [contenteditable]) {
          min-height: ${minHeight};
        }
        :global(.mdxeditor-toolbar) {
          border-bottom: 1px solid var(--color-border);
          background: var(--color-card);
          flex-wrap: wrap;
          gap: 4px;
        }
      `}</style>
    </div>
  );
}
