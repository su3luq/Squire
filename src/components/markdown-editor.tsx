'use client';

import { useRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownRenderer } from './markdown-renderer';
import { MarkdownToolbar, applyAction, type MarkdownAction } from './markdown-toolbar';

// Side-by-side markdown editor: toolbar on top, textarea on the left, live preview
// on the right. Stack vertically on narrow viewports.

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  disabled,
  rows = 16,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Wire up Ctrl/Cmd+B/I/K shortcuts. These hit even when the toolbar isn't visible.
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    let action: MarkdownAction | null = null;
    if (e.key === 'b' || e.key === 'B') action = 'bold';
    else if (e.key === 'i' || e.key === 'I') action = 'italic';
    else if (e.key === 'k' || e.key === 'K') action = 'link';
    if (!action) return;

    e.preventDefault();
    const ta = e.currentTarget;
    const result = applyAction(value, ta.selectionStart, ta.selectionEnd, action);
    onChange(result.value);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(result.selStart, result.selEnd);
    });
  }

  return (
    <div className="space-y-2">
      <MarkdownToolbar
        textareaRef={textareaRef}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">Markdown</p>
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={rows}
            className="resize-y font-mono text-sm leading-relaxed"
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">Preview</p>
          <div
            className="overflow-y-auto rounded-md border border-slate-200 bg-white p-4 shadow-sm"
            style={{ minHeight: `${rows * 1.6}rem` }}
          >
            <MarkdownRenderer source={value} emptyPlaceholder="Preview will appear here." />
          </div>
        </div>
      </div>
    </div>
  );
}
