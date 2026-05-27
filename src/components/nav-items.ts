// Icons are referenced by string key here, not by component, because
// nav items get passed from Server Components (the role layouts) into
// Client Components (SidebarNav, BottomTabsNav) — and React function
// components aren't serializable across the RSC boundary. The string
// is resolved to a Lucide icon in nav-icons.ts (client-side).

export type NavIconKey =
  | 'home'
  | 'quests'
  | 'review'
  | 'analytics'
  | 'insights'
  | 'inbox'
  | 'lessons'
  | 'classes'
  | 'student-review'
  | 'leaderboard'
  | 'my-quests'
  | 'library';

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconKey;
  badge?: number;
  /**
   * Extra path prefixes that should make this item appear active.
   * Used for "hub" entries like Insights, which routes to one URL
   * (/teacher/analytics) but should also light up when a sibling
   * page (/leaderboard) is open under the same tab strip.
   */
  activePaths?: string[];
};

type TeacherCounts = {
  pendingReviews?: number;
};

type StudentCounts = {
  dueReviews?: number;
};

// Exactly 5 items per role, consistent across desktop sidebar and mobile
// bottom tabs. Home is reachable via the brand-logo click; Inbox lives
// in the top-right header icon (not in this list).

export function getTeacherNav(counts: TeacherCounts): NavItem[] {
  return [
    { href: '/teacher/review', label: 'Review', icon: 'review', badge: counts.pendingReviews },
    { href: '/teacher/quests', label: 'Quests', icon: 'quests' },
    { href: '/teacher/lessons', label: 'Lessons', icon: 'lessons' },
    { href: '/teacher/classes', label: 'Classes', icon: 'classes' },
    {
      href: '/teacher/analytics',
      label: 'Insights',
      icon: 'insights',
      activePaths: ['/leaderboard'],
    },
  ];
}

export function getStudentNav(counts: StudentCounts): NavItem[] {
  return [
    { href: '/student/review', label: 'Review', icon: 'student-review', badge: counts.dueReviews },
    {
      href: '/student/quests',
      label: 'Quests',
      icon: 'quests',
      activePaths: ['/student/my-quests'],
    },
    { href: '/student/library', label: 'Library', icon: 'library' },
    { href: '/leaderboard', label: 'Ranks', icon: 'leaderboard' },
  ];
}
