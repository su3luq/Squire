import Link from 'next/link';
import { cn } from '@/lib/utils';

// The one card-grid tile. Both filled cards and the "add" affordance use
// it so empty and filled tiles always share a height (grid rows stretch to
// the tallest; the shared min-height covers a tile alone on its own row).
export function GridTile({
  href,
  add = false,
  className,
  children,
  ...rest
}: {
  href: string;
  add?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Link>, 'href' | 'className' | 'children'>) {
  return (
    <Link
      href={href}
      className={cn(
        'flex min-h-[4.5rem] rounded-lg border transition-colors',
        add
          ? 'items-center justify-center gap-2 border-dashed border-border text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground'
          : 'flex-col justify-between gap-2 border-border bg-card p-3 hover:border-primary/40 hover:bg-muted/40',
        className,
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}
