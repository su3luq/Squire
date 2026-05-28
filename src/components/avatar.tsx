import { cn } from '@/lib/utils';

interface AvatarProps {
  url?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  /**
   * Student rank tier — used for the aria-label and as a fallback
   * for the ring gradient when `ringConfig` isn't passed.
   */
  rank?: number | null;
  /**
   * Ring styling resolved from the dynamic ranks table. Pages that
   * fetch via `getRingConfigForTier()` pass this directly. When
   * absent, the avatar falls back to `FALLBACK_RING_GRADIENTS` keyed
   * on `rank` so call sites that haven't been wired through yet keep
   * rendering a ring.
   */
  ringConfig?: { gradient: string; glow?: string | null } | null;
}

const SIZE_CLASS: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg',
};

const RING_GAP: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'p-[1px]',
  sm: 'p-[1.5px]',
  md: 'p-[2px]',
  lg: 'p-[2.5px]',
};

// Fallback used when a caller passes `rank` but not `ringConfig`.
// Kept aligned with the seed values in migration 049 so the visual
// behavior is identical until the call site is wired to the dynamic
// helper.
const FALLBACK_RING_GRADIENTS: Record<number, { gradient: string; glow?: string }> = {
  1: {
    gradient: 'linear-gradient(135deg, #f0abfc 0%, #a78bfa 50%, #fde047 100%)',
    glow: 'rgba(216,180,254,0.70)',
  },
  2: {
    gradient: 'linear-gradient(135deg, #67e8f9 0%, #3b82f6 50%, #4338ca 100%)',
    glow: 'rgba(59,130,246,0.55)',
  },
  3: {
    gradient: 'linear-gradient(135deg, #6ee7b7 0%, #2dd4bf 50%, #047857 100%)',
    glow: 'rgba(16,185,129,0.45)',
  },
  4: {
    gradient: 'linear-gradient(135deg, #fde047 0%, #f59e0b 50%, #ea580c 100%)',
  },
  5: {
    gradient: 'linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 50%, #64748b 100%)',
  },
  6: {
    gradient: 'linear-gradient(135deg, #d97706 0%, #c2410c 50%, #9f1239 100%)',
  },
  7: {
    gradient: 'linear-gradient(135deg, #94a3b8 0%, #64748b 50%, #334155 100%)',
  },
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
  ringConfig,
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

  const effective =
    ringConfig ??
    (rank != null ? FALLBACK_RING_GRADIENTS[rank] ?? null : null);

  if (!effective) {
    return (
      <span className={cn('inline-flex shrink-0', className)}>{inner}</span>
    );
  }

  const style: React.CSSProperties = { background: effective.gradient };
  if (effective.glow) {
    style.boxShadow = `0 0 10px -2px ${effective.glow}`;
  }

  return (
    <span
      className={cn('inline-flex shrink-0 rounded-full', RING_GAP[size], className)}
      style={style}
      aria-label={rank != null ? `Rank ${rank}` : undefined}
    >
      <span className="inline-flex rounded-full bg-background p-[1px]">
        {inner}
      </span>
    </span>
  );
}
