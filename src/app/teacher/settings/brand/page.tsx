import { Sparkles, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { StatusChip } from '@/components/status-chip';
import { Progress } from '@/components/ui/progress';
import { RankEmblem } from '@/components/rank-emblem';
import { resolveGradient } from '@/lib/rank-gradients';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------
// Brand sandbox — preview the same composition under three accent
// candidates × light + dark mode. CSS variables are scoped to each
// wrapper so the global theme stays untouched. Once the teacher
// picks a direction, the chosen variant becomes the basis for the
// real theme migration in globals.css.
// ---------------------------------------------------------------

type Variant = {
  id: string;
  accent: string;
  accentLabel: string;
  swatch: string; // hex for the swatch dot
  mode: 'light' | 'dark';
};

const VARIANTS: Variant[] = [
  { id: 'crimson-light', accent: 'oklch(0.55 0.21 23)', accentLabel: 'Crimson · #d02c49', swatch: '#d02c49', mode: 'light' },
  { id: 'crimson-dark',  accent: 'oklch(0.62 0.21 23)', accentLabel: 'Crimson · #d02c49', swatch: '#d02c49', mode: 'dark' },
  { id: 'teal-light',    accent: 'oklch(0.62 0.13 195)', accentLabel: 'Teal · #01a89e', swatch: '#01a89e', mode: 'light' },
  { id: 'teal-dark',     accent: 'oklch(0.68 0.13 195)', accentLabel: 'Teal · #01a89e', swatch: '#01a89e', mode: 'dark' },
  { id: 'bronze-light',  accent: 'oklch(0.65 0.08 65)',  accentLabel: 'Bronze · #b89260', swatch: '#b89260', mode: 'light' },
  { id: 'bronze-dark',   accent: 'oklch(0.72 0.08 65)',  accentLabel: 'Bronze · #b89260', swatch: '#b89260', mode: 'dark' },
];

function tokensFor(v: Variant): React.CSSProperties {
  const tokens =
    v.mode === 'light'
      ? {
          '--background': 'oklch(0.985 0.003 80)',
          '--foreground': 'oklch(0.19 0.005 30)',
          '--card': 'oklch(1 0 0)',
          '--card-foreground': 'oklch(0.19 0.005 30)',
          '--popover': 'oklch(1 0 0)',
          '--popover-foreground': 'oklch(0.19 0.005 30)',
          '--muted': 'oklch(0.95 0.003 80)',
          '--muted-foreground': 'oklch(0.50 0.005 50)',
          '--accent': 'oklch(0.95 0.003 80)',
          '--accent-foreground': 'oklch(0.20 0.005 30)',
          '--border': 'oklch(0.91 0.004 80)',
          '--input': 'oklch(0.91 0.004 80)',
          '--ring': v.accent,
          '--primary': v.accent,
          '--primary-foreground': 'oklch(0.99 0 0)',
        }
      : {
          '--background': 'oklch(0.16 0.006 30)',
          '--foreground': 'oklch(0.97 0.003 80)',
          '--card': 'oklch(0.205 0.006 30)',
          '--card-foreground': 'oklch(0.97 0.003 80)',
          '--popover': 'oklch(0.205 0.006 30)',
          '--popover-foreground': 'oklch(0.97 0.003 80)',
          '--muted': 'oklch(0.26 0.006 30)',
          '--muted-foreground': 'oklch(0.72 0.005 50)',
          '--accent': 'oklch(0.26 0.006 30)',
          '--accent-foreground': 'oklch(0.97 0.003 80)',
          '--border': 'oklch(0.32 0.006 30)',
          '--input': 'oklch(0.32 0.006 30)',
          '--ring': v.accent,
          '--primary': v.accent,
          '--primary-foreground': 'oklch(0.99 0 0)',
        };
  return tokens as React.CSSProperties;
}

export default function BrandSandboxPage() {
  // A representative tier the preview shows (top rank — biggest emblem).
  const previewRank = {
    tier: 2,
    min_xp: 4200,
    gradient_id: 'sapphire',
    name: 'Sapphire',
    gradient: resolveGradient('sapphire'),
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Brand sandbox"
        subtitle="Three accent candidates × light + dark. Each card uses real app components scoped to its own tokens. Pick the one you want and I'll write the chosen palette into globals.css."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {VARIANTS.map((v) => (
          <article
            key={v.id}
            data-variant={v.id}
            style={{
              ...tokensFor(v),
              // Tighter display tracking per the typography pick.
              ['--display-tracking' as string]: '-0.02em',
            }}
            className="overflow-hidden rounded-2xl border bg-background"
          >
            {/* Variant header — label outside the themed content so it
                reads as a "swatch caption" regardless of the variant's
                own background tone. */}
            <header className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-3 text-sm">
              <div className="flex items-center gap-2 text-foreground">
                <span
                  aria-hidden
                  className="inline-block h-3.5 w-3.5 rounded-full ring-2 ring-background"
                  style={{ backgroundColor: v.swatch }}
                />
                <span className="font-semibold">{v.accentLabel}</span>
                <span className="text-muted-foreground">
                  · {v.mode === 'light' ? 'Light' : 'Dark'}
                </span>
              </div>
              <code className="rounded bg-background/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {v.id}
              </code>
            </header>

            {/* Content block — the actual preview surfaces consume the
                scoped tokens, so changing the variant changes everything. */}
            <div className="space-y-5 p-5 sm:p-6 text-foreground">
              {/* Rank hero excerpt */}
              <section className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-4">
                  <RankEmblem
                    tier={previewRank.tier}
                    rank={previewRank}
                    size="lg"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Rank {previewRank.tier}
                    </p>
                    <h2
                      className="mt-0.5 text-xl font-semibold text-foreground"
                      style={{ letterSpacing: 'var(--display-tracking)' }}
                    >
                      Student Sample
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      <span className="font-semibold tabular-nums text-foreground">
                        4,820
                      </span>{' '}
                      XP earned ·{' '}
                      <span className="font-semibold tabular-nums text-foreground">
                        1,380
                      </span>{' '}
                      XP to Rank 1
                    </p>
                    <div className="mt-3">
                      <Progress value={64} />
                    </div>
                  </div>
                </div>
              </section>

              {/* Closest rival card-on-card */}
              <section className="rounded-xl border border-border bg-card p-4">
                <header className="flex items-center gap-2 text-sm font-semibold">
                  <Trophy className="h-4 w-4 text-primary" aria-hidden />
                  Closest rival
                </header>
                <p className="mt-2 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    Student 4
                  </span>{' '}
                  is{' '}
                  <span className="font-semibold tabular-nums text-foreground">
                    60 XP
                  </span>{' '}
                  ahead — ~1 quest pass away.
                </p>
              </section>

              {/* Buttons */}
              <section className="flex flex-wrap items-center gap-2">
                <Button size="sm">
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Review (6 due)
                </Button>
                <Button size="sm" variant="outline">
                  Quest board
                </Button>
                <Button size="sm" variant="ghost">
                  Settings
                </Button>
                <a
                  href="#"
                  className="ml-1 text-sm font-medium text-primary hover:underline"
                >
                  See leaderboard →
                </a>
              </section>

              {/* Status chips row */}
              <section className="flex flex-wrap items-center gap-1.5">
                <StatusChip tone="primary">In progress</StatusChip>
                <StatusChip tone="warn">Awaiting review</StatusChip>
                <StatusChip tone="good">Passed</StatusChip>
                <StatusChip tone="danger">Resubmit needed</StatusChip>
                <StatusChip tone="muted">Enrolled</StatusChip>
              </section>

              {/* Body sample */}
              <section className="rounded-lg border border-border bg-card p-4">
                <p
                  className="text-sm font-semibold text-foreground"
                  style={{ letterSpacing: 'var(--display-tracking)' }}
                >
                  Today&apos;s review
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Streak protected — 12 days. 12 reviews today, all caught up.
                  Grind a quest for more XP.
                </p>
              </section>
            </div>
          </article>
        ))}
      </div>

      <footer className="rounded-lg border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
        Each variant is rendered with its own CSS variables scoped to the
        wrapper — the global theme is untouched. Tell me which variant ID to
        write into <code>src/app/globals.css</code> and I&apos;ll migrate
        the real theme on top of it.
      </footer>
    </div>
  );
}
