import { cn } from '@/lib/utils';

interface AvatarProps {
  url?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  /**
   * Student rank tier 1-7 (1 = top, 7 = starting). When provided, a
   * tier-themed gradient ring is drawn around the avatar so rank is
   * legible everywhere the avatar appears. Higher tiers get richer
   * gradients + glow; rank 7 is a muted "stone" ring to communicate
   * "you have a tier, keep climbing."
   */
  rank?: number | null;
}

const SIZE_CLASS: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg',
};

// Ring thickness scales with avatar size so the gradient is legible
// without overwhelming small avatars.
const RING_GAP: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'p-[1px]',
  sm: 'p-[1.5px]',
  md: 'p-[2px]',
  lg: 'p-[2.5px]',
};

const RING_GRADIENTS: Record<number, string> = {
  // Rank 1 — Mythic: fuchsia → violet → gold with strong glow.
  1: 'bg-gradient-to-br from-fuchsia-400 via-violet-500 to-amber-300 shadow-[0_0_14px_-2px_rgba(216,180,254,0.7)]',
  // Rank 2 — Sapphire: cyan → blue → indigo, blue shimmer glow.
  2: 'bg-gradient-to-br from-cyan-300 via-blue-500 to-indigo-700 shadow-[0_0_10px_-2px_rgba(59,130,246,0.55)]',
  // Rank 3 — Emerald: green → teal, soft glow.
  3: 'bg-gradient-to-br from-emerald-300 via-teal-400 to-emerald-600 shadow-[0_0_8px_-2px_rgba(16,185,129,0.45)]',
  // Rank 4 — Gold: warm sunny yellow → amber → orange.
  4: 'bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500',
  // Rank 5 — Silver: cool steel sheen.
  5: 'bg-gradient-to-br from-slate-100 via-slate-300 to-slate-500',
  // Rank 6 — Bronze: warm copper.
  6: 'bg-gradient-to-br from-amber-600 via-orange-700 to-red-800',
  // Rank 7 — Stone: matte dark slate (starter tier).
  7: 'bg-gradient-to-br from-slate-400 via-slate-500 to-slate-700',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  url,
  name,
  size = 'md',
  className,
  rank,
}: AvatarProps) {
  const sizeClass = SIZE_CLASS[size];

  const inner = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      className={cn('rounded-full object-cover', sizeClass)}
      loading="lazy"
    />
  ) : (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground',
        sizeClass,
      )}
      aria-label={name}
      title={name}
    >
      {initials(name)}
    </span>
  );

  const ringClass = rank != null ? RING_GRADIENTS[rank] : undefined;
  if (!ringClass) {
    return <span className={cn('inline-flex shrink-0', className)}>{inner}</span>;
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 rounded-full',
        ringClass,
        RING_GAP[size],
        className,
      )}
      aria-label={`Rank ${rank}`}
    >
      <span className="inline-flex rounded-full bg-background p-[1px]">
        {inner}
      </span>
    </span>
  );
}
