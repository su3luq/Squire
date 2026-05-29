'use client';

import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from '@/lib/use-theme';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

/**
 * Theme mode toggle. Tri-state (Light / Dark / System) — system follows
 * the OS preference and updates live via the inline pre-paint script.
 *
 * The change applies immediately (no router refresh needed) — the
 * useTheme hook writes localStorage and toggles the .dark class on
 * <html> in a single tick.
 */
export function ThemeSettings() {
  const { theme, setTheme, ready } = useTheme();

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Appearance</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Light follows the bronze-on-cream brand. Dark inverts to warm
          slate while keeping the same accent. System mirrors your OS
          preference.
        </p>
      </div>
      <div className="shrink-0">
        {/* Render the three buttons as small chips. ToggleChipGroup expects
         * href-based navigation, so we wrap with a click handler instead. */}
        <div role="group" aria-label="Theme mode" className="flex gap-1.5">
          {OPTIONS.map((o) => {
            const active = o.value === theme;
            const Icon = o.icon;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setTheme(o.value)}
                disabled={!ready}
                aria-pressed={active}
                className={
                  active
                    ? 'inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background transition-colors disabled:opacity-50'
                    : 'inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50'
                }
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
