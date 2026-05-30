import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Central semantic-status → visual chip mapping. Use everywhere a quest
 * status, submission status, or generic tone-coded label needs to render.
 *
 * Tones (rather than literal status strings) so callers can pick the right
 * tone for ad-hoc labels too — e.g. `<StatusChip tone="warn">Stuck</StatusChip>`.
 *
 * The forest-green brand is reserved for "primary" tone only. Other
 * semantic tones use distinct hues (amber for in-flight risk, emerald for
 * confirmed wins, slate for neutral, red for blocked) so colorblind users
 * are not the only thing distinguishing them — we always pair tone with
 * an explicit label string.
 */
export type ChipTone =
  | 'primary'
  | 'good'
  | 'warn'
  | 'danger'
  | 'muted'
  | 'info';

const TONE_CLASSES: Record<ChipTone, string> = {
  primary: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary',
  good: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300',
  danger: 'bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive',
  muted: 'bg-muted text-muted-foreground',
  info: 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200',
};

export function StatusChip({
  tone = 'muted',
  className,
  children,
  capitalize = false,
}: {
  tone?: ChipTone;
  className?: string;
  children: React.ReactNode;
  capitalize?: boolean;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-transparent',
        TONE_CLASSES[tone],
        capitalize && 'capitalize',
        className,
      )}
    >
      {children}
    </Badge>
  );
}

/**
 * Quest-domain status → tone mapping. Add new statuses here only — never
 * sprinkle tone choices in page code.
 */
const QUEST_STATUS_TONES: Record<string, ChipTone> = {
  active: 'primary',
  in_progress: 'primary',
  enrolled: 'muted',
  submitted: 'warn',
  awaiting_review: 'warn',
  pending_review: 'warn',
  resubmit_needed: 'danger',
  failed: 'danger',
  passed: 'good',
};

const QUEST_STATUS_LABELS: Record<string, string> = {
  active: 'In progress',
  in_progress: 'In progress',
  enrolled: 'Enrolled',
  submitted: 'Awaiting review',
  awaiting_review: 'Awaiting review',
  pending_review: 'Awaiting review',
  resubmit_needed: 'Resubmit needed',
  failed: 'Failed',
  passed: 'Passed',
};

export function QuestStatusChip({
  status,
  labelOverride,
  className,
}: {
  status: string;
  labelOverride?: string;
  className?: string;
}) {
  const tone = QUEST_STATUS_TONES[status] ?? 'muted';
  const label = labelOverride ?? QUEST_STATUS_LABELS[status] ?? status;
  return (
    <StatusChip tone={tone} className={className}>
      {label}
    </StatusChip>
  );
}
