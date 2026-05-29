'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import {
  ToggleChipGroup,
  type ToggleChipOption,
} from '@/components/toggle-chip-group';

const SUB_TABS = [
  { value: 'pulse', href: '/teacher/analytics', label: 'Pulse', match: 'exact' },
  {
    value: 'quests',
    href: '/teacher/analytics/quests',
    label: 'Quests',
    match: 'prefix',
  },
  {
    value: 'content',
    href: '/teacher/analytics/content',
    label: 'Content',
    match: 'exact',
  },
  {
    value: 'at-risk',
    href: '/teacher/analytics/at-risk',
    label: 'At-risk',
    match: 'exact',
  },
] as const;

/**
 * Secondary nav for the Performance tab. Preserves the ?class= filter
 * as the teacher flips between sub-views.
 */
export function AnalyticsSubTabs() {
  const pathname = usePathname();
  const search = useSearchParams();
  const classParam = search.get('class');
  const queryString = classParam ? `?class=${encodeURIComponent(classParam)}` : '';

  const current =
    SUB_TABS.find((t) =>
      t.match === 'prefix'
        ? pathname === t.href || pathname.startsWith(`${t.href}/`)
        : pathname === t.href,
    )?.value ?? 'pulse';

  const options: ToggleChipOption[] = SUB_TABS.map((t) => ({
    value: t.value,
    label: t.label,
    href: `${t.href}${queryString}`,
  }));

  return (
    <ToggleChipGroup
      ariaLabel="Insights sections"
      current={current}
      options={options}
      className="mb-6"
    />
  );
}
