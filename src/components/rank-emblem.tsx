import { cn } from '@/lib/utils';
import type { ResolvedRank } from '@/lib/ranks-config';

type EmblemSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_BOX: Record<EmblemSize, string> = {
  xs: 'h-7 w-7 text-[10px]',
  sm: 'h-10 w-10 text-sm',
  md: 'h-14 w-14 text-lg',
  lg: 'h-20 w-20 text-2xl',
  xl: 'h-28 w-28 text-4xl',
};

const SIZE_BORDER: Record<EmblemSize, string> = {
  xs: 'border',
  sm: 'border-[1.5px]',
  md: 'border-2',
  lg: 'border-[3px]',
  xl: 'border-[3px]',
};

interface RankEmblemProps {
  tier: number;
  rank?: ResolvedRank | null;
  size?: EmblemSize;
  className?: string;
  /** Subtle pulsing glow for apex tiers. Off by default. */
  pulse?: boolean;
}

/**
 * Tier-colored rank emblem. A filled circle using the rank's configured
 * gradient (from the dynamic ladder set up in migration 049) with the
 * tier number centered on top.
 *
 * Pair with <Avatar>'s ring — the emblem is the *identity* (who you are
 * in the ladder); the avatar's ring is the *signal* (what tier this person
 * is, at-a-glance, next to their picture).
 *
 * Render where the rank itself is the subject: the home rank hero, the
 * rank-up modal (Pass 3), the leaderboard podium, the rank ladder page.
 */
export function RankEmblem({
  tier,
  rank,
  size = 'md',
  className,
  pulse = false,
}: RankEmblemProps) {
  const gradient =
    rank?.gradient?.gradient ??
    'linear-gradient(135deg, #cbd5e1 0%, #64748b 50%, #334155 100%)';
  const glow = rank?.gradient?.glow ?? null;
  return (
    <div
      role="img"
      aria-label={`Rank ${tier}${rank?.name ? ` — ${rank.name}` : ''}`}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full border-white/70 font-bold text-white shadow-sm',
        SIZE_BOX[size],
        SIZE_BORDER[size],
        pulse && glow && 'animate-pulse',
        className,
      )}
      style={{
        background: gradient,
        boxShadow: glow ? `0 0 0 4px ${glow}` : undefined,
      }}
    >
      <span className="relative tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
        {tier}
      </span>
    </div>
  );
}
