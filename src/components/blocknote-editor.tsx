'use client';

import { useEffect, useRef } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/shadcn/style.css';

// Notion-style block editor that produces markdown via its lossy serializer.
// We treat markdown as the source of truth — no JSON column yet. Round-trip
// markdown -> blocks -> markdown is good enough for our content shape
// (text + headings + lists + code + tables + links + images); the renderer
// continues to handle the lone-URL YouTube/video embed magic on read paths.

type Props = {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  editable?: boolean;
};

const DEBOUNCE_MS = 250;

export function BlockNoteEditor({
  value,
  onChange,
  editable = true,
}: Props) {
  const editor = useCreateBlockNote();

  // Hydrate the editor from incoming markdown once on mount. Form state
  // owns the markdown after this; the editor owns its blocks.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    let cancelled = false;
    (async () => {
      if (!value) return;
      try {
        const blocks = await editor.tryParseMarkdownToBlocks(value);
        if (!cancelled && blocks.length > 0) {
          editor.replaceBlocks(editor.document, blocks);
        }
      } catch (err) {
        console.error('BlockNote markdown parse failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editor, value]);

  // Debounce the markdown serialization so we don't run it on every keystroke.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleChange() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const md = await editor.blocksToMarkdownLossy(editor.document);
        onChange(md);
      } catch (err) {
        console.error('BlockNote markdown serialize failed', err);
      }
    }, DEBOUNCE_MS);
  }

  return (
    <div className="rounded-md border border-input bg-card focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
      <BlockNoteView
        editor={editor}
        editable={editable}
        onChange={handleChange}
        theme="light"
      />
    </div>
  );
}
