'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSoundsEnabled } from '@/lib/use-sounds-enabled';

/**
 * Toggle for the celebratory sound effects (XP gain, rank up, quest pass).
 * Stored in localStorage so the choice is per-device — matches how a
 * student might want sound at home but silent at school.
 *
 * Audio assets aren't shipped yet; this preference becomes audible once
 * playSound() in lib/use-sounds-enabled.ts wires actual files in.
 */
export function SoundSettings() {
  const { enabled, setEnabled, ready } = useSoundsEnabled();

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Sound effects</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Play short sounds when you earn XP, rank up, or pass a quest. Off
          by default to keep classrooms quiet — flip it on at home if you
          want the full hit.
        </p>
      </div>
      <Button
        type="button"
        variant={enabled ? 'default' : 'outline'}
        size="sm"
        onClick={() => setEnabled(!enabled)}
        disabled={!ready}
        aria-pressed={enabled}
      >
        {enabled ? (
          <>
            <Volume2 className="h-4 w-4" aria-hidden />
            On
          </>
        ) : (
          <>
            <VolumeX className="h-4 w-4" aria-hidden />
            Off
          </>
        )}
      </Button>
    </div>
  );
}
