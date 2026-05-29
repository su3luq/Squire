'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'rl-sounds-enabled';

/**
 * Local-storage backed sound preference. Muted by default — students
 * have to explicitly opt in (classroom etiquette). Reading is SSR-safe:
 * returns false on the server and hydrates from storage on mount.
 *
 * Pair with {@link playSound} so future toast / modal triggers can play
 * audio when the preference is on. Audio assets aren't shipped yet, so
 * playSound is a no-op until they land.
 */
export function useSoundsEnabled(): {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  ready: boolean;
} {
  const [enabled, setEnabledState] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Hydrate the local-storage preference on mount. The setState calls
    // are an intentional one-shot sync after SSR, mirroring the same
    // pattern used by app-shell.tsx for the sidebar collapse memory.
    try {
      const stored = localStorage.getItem(STORAGE_KEY) === 'true';
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEnabledState(stored);
    } catch {
      // localStorage can throw in private mode.
    }
    setReady(true);
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // ignore
    }
  }, []);

  return { enabled, setEnabled, ready };
}

/**
 * Check the same preference without subscribing to changes — for
 * fire-and-forget call sites (toasts, modals) that just want to know
 * "should I play sound right now?".
 */
export function soundsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Audio playback helper. Currently a no-op — audio assets are deferred
 * to a follow-up commit once we know what feels right per event. The
 * shape is `playSound('rank-up')` so existing call sites won't change
 * when the files land.
 */
export function playSound(name: 'xp' | 'rank-up' | 'quest-pass'): void {
  if (!soundsEnabled()) return;
  // Future: route to <audio> instances or a small AudioContext player
  // keyed on `name`. Intentionally a no-op for now — see the docstring
  // above. The unused-ref ensures the parameter stays in the public API.
  void name;
}
