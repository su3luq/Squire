import { cn } from '@/lib/utils';

/**
 * Minimal skeleton placeholder. Renders an animated pulse rectangle.
 * Use to scaffold the visual shape of a page while data is streaming —
 * the swap to real content is smoother when the rough layout is already
 * on screen.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}
