'use client';

import { useCallback, useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';
import { createClient } from '@/lib/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RankEmblem } from '@/components/rank-emblem';
import {
  RANK_GRADIENT_BY_ID,
  type RankGradient,
} from '@/lib/rank-gradients';
import type { ResolvedRank } from '@/lib/ranks-config';

type RankUpData = {
  notificationId: string;
  oldRank: number | null;
  newRank: number;
  xpTotal: number | null;
  resolvedRank: ResolvedRank | null;
};

const FETCH_LIMIT = 5;

/**
 * Client-mounted gate that polls once on student app load for any unread
 * "celebration" notifications and stages the visible reward:
 * - rank_up → theatrical modal with the new tier emblem (consumes the
 *   notify_on_rank_up trigger from migration 048)
 * - submission_passed → confetti burst + +XP toast (no modal — confetti
 *   alone reads as celebration without blocking)
 *
 * Both consume their notification rows on display so the moment fires
 * exactly once per ranked event.
 */
export function CelebrationGate() {
  const [rankUp, setRankUp] = useState<RankUpData | null>(null);
  const [open, setOpen] = useState(false);

  const supabase = useCallback(() => createClient(), []);

  const markRead = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const client = supabase();
      await client
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .in('id', ids);
    },
    [supabase],
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const client = supabase();
      const { data, error } = await client
        .from('notifications')
        .select('id, type, title, body, data, created_at')
        .in('type', ['rank_up', 'submission_passed'])
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT);
      if (cancelled || error || !data || data.length === 0) return;

      // Only keep the most recent rank_up; older ones get marked read in
      // a single sweep so they don't pile up across sessions.
      const rankUpRows = data.filter((n) => n.type === 'rank_up');
      const newestRankUp = rankUpRows[0] ?? null;
      const olderRankUpIds = rankUpRows.slice(1).map((n) => n.id);

      const questPassRows = data.filter((n) => n.type === 'submission_passed');

      // --- Quest-pass celebration: confetti + toast for each, mark read.
      if (questPassRows.length > 0) {
        fireConfetti();
        await markRead(questPassRows.map((n) => n.id));
      }

      // --- Rank up celebration: open modal for the newest, mark older ones.
      if (newestRankUp) {
        const dataPayload =
          (newestRankUp.data as
            | {
                old_rank?: number;
                new_rank?: number;
                xp_total?: number;
              }
            | null) ?? null;
        const newRank = dataPayload?.new_rank ?? 1;

        // Fetch the rank row separately so we have the gradient ID.
        const { data: rankRow } = await client
          .from('ranks')
          .select('tier, min_xp, gradient_id, name')
          .eq('tier', newRank)
          .maybeSingle();

        let resolved: ResolvedRank | null = null;
        if (rankRow) {
          const gradient: RankGradient | null =
            RANK_GRADIENT_BY_ID[rankRow.gradient_id] ?? null;
          resolved = { ...rankRow, gradient };
        }

        setRankUp({
          notificationId: newestRankUp.id,
          oldRank: dataPayload?.old_rank ?? null,
          newRank,
          xpTotal: dataPayload?.xp_total ?? null,
          resolvedRank: resolved,
        });
        setOpen(true);
      }

      if (olderRankUpIds.length > 0) await markRead(olderRankUpIds);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [supabase, markRead]);

  async function handleDismiss() {
    if (rankUp) await markRead([rankUp.notificationId]);
    setOpen(false);
  }

  if (!rankUp) return null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void handleDismiss();
      }}
    >
      <AlertDialogContent className="max-w-sm sm:max-w-md">
        <AlertDialogHeader className="!grid-rows-[auto_auto_auto] !place-items-center !text-center">
          <div className="mb-1">
            <RankEmblem
              tier={rankUp.newRank}
              rank={rankUp.resolvedRank}
              size="xl"
              pulse
            />
          </div>
          <AlertDialogTitle className="text-xl font-semibold">
            Rank Up — you climbed to Rank {rankUp.newRank}
            {rankUp.resolvedRank?.name && (
              <span className="ml-2 text-base text-muted-foreground">
                · {rankUp.resolvedRank.name}
              </span>
            )}
          </AlertDialogTitle>
          <AlertDialogDescription className="!text-center">
            {rankUp.oldRank && (
              <>
                Up from Rank {rankUp.oldRank}.{' '}
              </>
            )}
            {rankUp.xpTotal && (
              <>
                <span className="font-semibold tabular-nums text-foreground">
                  {rankUp.xpTotal.toLocaleString()}
                </span>{' '}
                XP banked.{' '}
              </>
            )}
            Keep climbing.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="!grid-cols-1">
          <AlertDialogAction
            onClick={handleDismiss}
            className="w-full"
          >
            <Trophy className="h-4 w-4" aria-hidden />
            Onwards
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function fireConfetti() {
  // Two staggered bursts from the bottom corners — reads as celebratory
  // without dominating the screen.
  const end = Date.now() + 700;
  const colors = ['#10b981', '#f59e0b', '#3b82f6', '#a78bfa'];

  (function frame() {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 1 },
      colors,
      scalar: 0.9,
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 1 },
      colors,
      scalar: 0.9,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

export { fireConfetti };
