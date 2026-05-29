'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

interface ClassFilterProps {
  classes: { id: string; name: string }[];
}

/**
 * Compact class scope selector. Writes ?class= into the URL on change
 * so the value persists across sub-tab navigation in /teacher/analytics.
 */
export function ClassFilter({ classes }: ClassFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const value = search.get('class') ?? 'all';

  if (classes.length === 0) return null;

  function handleChange(next: string) {
    const params = new URLSearchParams(search.toString());
    if (next === 'all') params.delete('class');
    else params.set('class', next);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <label className="inline-flex shrink-0 items-center gap-2 text-xs">
      <span className="font-medium text-muted-foreground">Class</span>
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded-md border border-input bg-card px-2.5 py-1 text-xs shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="all">All classes</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
