'use client';

import { Textarea } from '@/components/ui/textarea';
import { MarkdownPreview } from './markdown-preview';

// Side-by-side markdown editor: textarea on the left, live preview on the right.
// Stack vertically on narrow viewports.

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  disabled,
  rows = 14,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-500">Markdown</p>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          className="font-mono text-sm"
        />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-500">Preview</p>
        <div
          className="min-h-[280px] rounded-md border border-slate-200 bg-white p-3"
          style={{ minHeight: `${rows * 1.5}rem` }}
        >
          <MarkdownPreview source={value} />
        </div>
      </div>
    </div>
  );
}
