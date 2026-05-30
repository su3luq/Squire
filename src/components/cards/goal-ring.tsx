import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

// Animated daily-goal progress ring for the review hero. The filled arc
// uses rounded caps and a pulsing bronze glow; a "comet" highlight runs
// from the arc's start to its filled end (the end angle is passed to the
// CSS animation via --rl-fill-deg). Motion lives in globals.css
// (.rl-ring-prog / .rl-ring-comet) and is disabled under reduced-motion.

const R = 42;
const CIRC = 2 * Math.PI * R;

export function GoalRing({
  value,
  goal,
  size = 92,
  className,
}: {
  value: number;
  goal: number;
  size?: number;
  className?: string;
}) {
  const fill = goal > 0 ? Math.max(0, Math.min(1, value / goal)) : 0;
  const dash = fill * CIRC;
  const fillDeg = fill * 360;

  return (
    <div
      className={cn('relative', className)}
      style={
        {
          width: size,
          height: size,
          '--rl-fill-deg': `${fillDeg}deg`,
        } as CSSProperties
      }
    >
      <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="var(--muted)"
          strokeWidth="7.5"
        />
        <circle
          className="rl-ring-prog"
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="7.5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${CIRC}`}
          transform="rotate(-90 50 50)"
        />
        {fill > 0 && (
          <g className="rl-ring-comet">
            <circle
              cx="50"
              cy="8"
              r="3.4"
              fill="#ffe2cc"
              style={{ filter: 'drop-shadow(0 0 5px var(--primary))' }}
            />
          </g>
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold leading-none tabular-nums">
          {value}/{goal}
        </span>
        <span className="mt-1 text-[0.5rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          today
        </span>
      </div>
    </div>
  );
}
