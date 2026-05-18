'use client';

import { type RefObject } from 'react';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  Code,
  Code2,
  Table as TableIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Action =
  | {
      kind: 'inline-wrap';
      prefix: string;
      suffix: string;
      placeholder: string;
    }
  | {
      kind: 'line-prefix';
      prefix: string;
    }
  | {
      kind: 'block-insert';
      template: string;
      // Cursor index from start of inserted template after insertion
      cursorOffset?: number;
      // Length of selection to make after insertion (highlights the placeholder)
      selectLength?: number;
    };

export type MarkdownAction =
  | 'bold'
  | 'italic'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'ul'
  | 'ol'
  | 'quote'
  | 'link'
  | 'image'
  | 'inline-code'
  | 'code-block'
  | 'table';

const ACTIONS: Record<MarkdownAction, Action> = {
  bold: { kind: 'inline-wrap', prefix: '**', suffix: '**', placeholder: 'bold' },
  italic: { kind: 'inline-wrap', prefix: '*', suffix: '*', placeholder: 'italic' },
  'inline-code': { kind: 'inline-wrap', prefix: '`', suffix: '`', placeholder: 'code' },
  h1: { kind: 'line-prefix', prefix: '# ' },
  h2: { kind: 'line-prefix', prefix: '## ' },
  h3: { kind: 'line-prefix', prefix: '### ' },
  ul: { kind: 'line-prefix', prefix: '- ' },
  ol: { kind: 'line-prefix', prefix: '1. ' },
  quote: { kind: 'line-prefix', prefix: '> ' },
  link: {
    kind: 'block-insert',
    template: '[text](https://)',
    cursorOffset: 1,
    selectLength: 4,
  },
  image: {
    kind: 'block-insert',
    template: '![alt](https://)',
    cursorOffset: 2,
    selectLength: 3,
  },
  'code-block': {
    kind: 'block-insert',
    template: '```\ncode\n```',
    cursorOffset: 4,
    selectLength: 4,
  },
  table: {
    kind: 'block-insert',
    template:
      '| Column 1 | Column 2 | Column 3 |\n| -------- | -------- | -------- |\n| Cell     | Cell     | Cell     |',
    cursorOffset: 2,
    selectLength: 8,
  },
};

// Apply a markdown action to a textarea by editing its controlled value and
// repositioning the cursor. Pure helper — exported for testing.
export function applyAction(
  value: string,
  selStart: number,
  selEnd: number,
  action: MarkdownAction
): { value: string; selStart: number; selEnd: number } {
  const spec = ACTIONS[action];

  if (spec.kind === 'inline-wrap') {
    const selected = value.slice(selStart, selEnd);
    const inner = selected || spec.placeholder;
    const inserted = `${spec.prefix}${inner}${spec.suffix}`;
    const newValue = value.slice(0, selStart) + inserted + value.slice(selEnd);
    const innerStart = selStart + spec.prefix.length;
    const innerEnd = innerStart + inner.length;
    return { value: newValue, selStart: innerStart, selEnd: innerEnd };
  }

  if (spec.kind === 'line-prefix') {
    // Find the start of the current line (after the last \n before selStart, or 0).
    const lineStart = value.lastIndexOf('\n', selStart - 1) + 1;
    const newValue = value.slice(0, lineStart) + spec.prefix + value.slice(lineStart);
    const shift = spec.prefix.length;
    return {
      value: newValue,
      selStart: selStart + shift,
      selEnd: selEnd + shift,
    };
  }

  // block-insert
  const { template, cursorOffset = 0, selectLength = 0 } = spec;
  const newValue = value.slice(0, selStart) + template + value.slice(selEnd);
  const newSelStart = selStart + cursorOffset;
  const newSelEnd = newSelStart + selectLength;
  return { value: newValue, selStart: newSelStart, selEnd: newSelEnd };
}

// ============================================================================

type ToolbarProps = {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
};

export function MarkdownToolbar({
  textareaRef,
  value,
  onChange,
  disabled,
}: ToolbarProps) {
  function run(action: MarkdownAction) {
    const ta = textareaRef.current;
    if (!ta) return;
    const result = applyAction(value, ta.selectionStart, ta.selectionEnd, action);
    onChange(result.value);
    // Restore focus + selection on the next tick after React re-renders the value.
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(result.selStart, result.selEnd);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-1">
      <ToolbarButton onClick={() => run('bold')} disabled={disabled} title="Bold (Ctrl+B)">
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => run('italic')} disabled={disabled} title="Italic (Ctrl+I)">
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => run('inline-code')}
        disabled={disabled}
        title="Inline code"
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>
      <Separator />
      <ToolbarButton onClick={() => run('h1')} disabled={disabled} title="Heading 1">
        <Heading1 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => run('h2')} disabled={disabled} title="Heading 2">
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => run('h3')} disabled={disabled} title="Heading 3">
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>
      <Separator />
      <ToolbarButton onClick={() => run('ul')} disabled={disabled} title="Bullet list">
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => run('ol')} disabled={disabled} title="Numbered list">
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => run('quote')} disabled={disabled} title="Quote">
        <Quote className="h-4 w-4" />
      </ToolbarButton>
      <Separator />
      <ToolbarButton onClick={() => run('link')} disabled={disabled} title="Link (Ctrl+K)">
        <LinkIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => run('image')} disabled={disabled} title="Image">
        <ImageIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => run('table')} disabled={disabled} title="Table">
        <TableIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => run('code-block')}
        disabled={disabled}
        title="Code block"
      >
        <Code2 className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-700 transition-colors',
        'hover:bg-slate-200 hover:text-slate-900',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'
      )}
    >
      {children}
    </button>
  );
}

function Separator() {
  return <div className="mx-1 h-5 w-px bg-slate-300" aria-hidden />;
}
