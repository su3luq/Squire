'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function CopyMarkdownButton({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  async function handleCopy() {
    setError(false);
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted',
        copied && 'border-primary/40 text-primary',
        error && 'border-destructive/40 text-destructive',
        className
      )}
      aria-live="polite"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" />
          Copied!
        </>
      ) : error ? (
        <>Copy failed</>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copy markdown
        </>
      )}
    </button>
  );
}
