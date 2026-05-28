'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { RANK_GRADIENTS } from '@/lib/rank-gradients';
import { saveRanks, type RankInput } from './actions';

type Row = {
  tier: number;
  min_xp: number;
  gradient_id: string;
  name: string | null;
};

interface Props {
  initial: Row[];
}

export function RanksEditor({ initial }: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length
      ? initial
      : [
          { tier: 1, min_xp: 1000, gradient_id: 'mythic', name: null },
          { tier: 2, min_xp: 0, gradient_id: 'stone', name: null },
        ],
  );
  const [status, setStatus] = useState<
    { type: 'idle' } | { type: 'error'; message: string } | { type: 'success' }
  >({ type: 'idle' });
  const [isPending, startTransition] = useTransition();

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }
  function addRow() {
    setRows((rs) => {
      const maxTier = rs.reduce((m, r) => Math.max(m, r.tier), 0);
      const minXp =
        rs.length === 0
          ? 0
          : Math.max(0, Math.min(...rs.map((r) => r.min_xp)) - 100);
      return [
        ...rs,
        { tier: maxTier + 1, min_xp: minXp, gradient_id: 'stone', name: null },
      ];
    });
  }

  function handleSave() {
    setStatus({ type: 'idle' });
    const payload: RankInput[] = rows.map((r) => ({
      tier: Number(r.tier),
      min_xp: Number(r.min_xp),
      gradient_id: r.gradient_id,
      name: r.name?.trim() || null,
    }));
    startTransition(async () => {
      const res = await saveRanks(payload);
      if (res.error) {
        setStatus({ type: 'error', message: res.error });
      } else {
        setStatus({ type: 'success' });
      }
    });
  }

  // Sort for display only — server re-sorts before validating.
  const display = [...rows].sort((a, b) => a.tier - b.tier);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border">
        <div className="hidden border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[3.5rem_1fr_7rem_10rem_2.5rem] sm:gap-3">
          <span>Tier</span>
          <span>Name (optional)</span>
          <span>Min XP</span>
          <span>Gradient</span>
          <span />
        </div>
        <ul className="divide-y divide-border">
          {display.map((r, displayIdx) => {
            const idx = rows.indexOf(r);
            const gradient = RANK_GRADIENTS.find((g) => g.id === r.gradient_id);
            return (
              <li
                key={`${r.tier}-${displayIdx}`}
                className="grid items-center gap-3 px-4 py-3 sm:grid-cols-[3.5rem_1fr_7rem_10rem_2.5rem]"
              >
                <Input
                  type="number"
                  min={1}
                  value={r.tier}
                  onChange={(e) =>
                    updateRow(idx, { tier: Number(e.target.value) || 0 })
                  }
                  aria-label="Tier number"
                />
                <Input
                  type="text"
                  placeholder="e.g. Apprentice"
                  value={r.name ?? ''}
                  onChange={(e) => updateRow(idx, { name: e.target.value })}
                  aria-label="Tier name"
                />
                <Input
                  type="number"
                  min={0}
                  value={r.min_xp}
                  onChange={(e) =>
                    updateRow(idx, { min_xp: Number(e.target.value) || 0 })
                  }
                  aria-label="Min XP threshold"
                />
                <div className="flex items-center gap-2">
                  <span
                    className="h-7 w-7 shrink-0 rounded-full ring-1 ring-border"
                    style={{ background: gradient?.gradient }}
                    aria-hidden
                  />
                  <select
                    value={r.gradient_id}
                    onChange={(e) =>
                      updateRow(idx, { gradient_id: e.target.value })
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Gradient preset"
                  >
                    {RANK_GRADIENTS.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(idx)}
                  aria-label={`Remove tier ${r.tier}`}
                  disabled={rows.length <= 2}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={addRow}>
          <Plus className="h-4 w-4" />
          Add tier
        </Button>
        <Button type="button" onClick={handleSave} disabled={isPending}>
          {isPending ? 'Saving…' : 'Save ladder'}
        </Button>
        {status.type === 'success' ? (
          <p className="text-sm font-medium text-primary">
            Saved. Student ranks were recomputed.
          </p>
        ) : status.type === 'error' ? (
          <p className="text-sm font-medium text-destructive">
            {status.message}
          </p>
        ) : null}
      </div>

      <Hint />

      <Label className="text-sm font-semibold">Gradient swatches</Label>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {RANK_GRADIENTS.map((g) => (
          <div
            key={g.id}
            className={cn(
              'flex flex-col items-center gap-2 rounded-md border border-border p-3',
            )}
          >
            <span
              className="h-12 w-12 rounded-full ring-1 ring-border"
              style={{
                background: g.gradient,
                boxShadow: g.glow ? `0 0 10px -2px ${g.glow}` : undefined,
              }}
              aria-hidden
            />
            <span className="text-xs font-medium">{g.label}</span>
            <span className="text-[10px] text-muted-foreground">{g.id}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Hint() {
  return (
    <p className="text-xs text-muted-foreground">
      Tier 1 is the highest rank. Lower tier numbers must have higher min XP
      thresholds (e.g. tier 1: 6000 XP, tier 2: 4200 XP, …). Saving recomputes
      every student&apos;s rank against the new ladder; only genuine rank-UPS
      trigger notifications.
    </p>
  );
}
