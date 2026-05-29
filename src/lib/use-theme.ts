'use client';

import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'rl-theme';

/**
 * Theme mode preference, stored in localStorage. Mirrors the
 * useSoundsEnabled pattern — per-device opt-in, hydrated after mount.
 *
 * The initial render relies on the pre-paint script in layout.tsx to
 * set the .dark class on <html> before React mounts; this hook owns
 * the runtime toggle and persistence. The script handles SSR/FOUC.
 */
export function useTheme(): {
  theme: ThemeMode;
  setTheme: (next: ThemeMode) => void;
  ready: boolean;
} {
  const [theme, setThemeState] = useState<ThemeMode>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored: ThemeMode = 'system';
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === 'light' || raw === 'dark' || raw === 'system') stored = raw;
    } catch {
      // localStorage can throw in private mode.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(stored);
    setReady(true);
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    applyThemeClass(next);
  }, []);

  return { theme, setTheme, ready };
}

/**
 * Resolves the current preference into an actual class on <html>.
 * Exposed so the settings toggle can apply changes immediately
 * without waiting for an effect.
 */
export function applyThemeClass(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const sysIsDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = mode === 'dark' || (mode === 'system' && sysIsDark);
  document.documentElement.classList.toggle('dark', dark);
}
