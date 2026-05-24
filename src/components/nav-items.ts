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
};

type TeacherCounts = {
  pendingReviews?: number;
  unreadNotifications?: number;
};

type StudentCounts = {
  dueReviews?: number;
  unreadNotifications?: number;
};

// First 5 items become bottom tabs on mobile; everything stays in the sidebar.
// Order is "most-used first" so the mobile shortcut surface is the right one.

export function getTeacherNav(counts: TeacherCounts): NavItem[] {
  return [
    { href: '/teacher', label: 'Home', icon: 'home' },
    { href: '/teacher/quests', label: 'Quests', icon: 'quests' },
    { href: '/teacher/review', label: 'Review', icon: 'review', badge: counts.pendingReviews },
    { href: '/teacher/analytics', label: 'Analytics', icon: 'analytics' },
    { href: '/notifications', label: 'Inbox', icon: 'inbox', badge: counts.unreadNotifications },
    { href: '/teacher/lessons', label: 'Lessons', icon: 'lessons' },
    { href: '/teacher/classes', label: 'Classes', icon: 'classes' },
    { href: '/leaderboard', label: 'Ranks', icon: 'leaderboard' },
  ];
}

export function getStudentNav(counts: StudentCounts): NavItem[] {
  return [
    { href: '/student', label: 'Home', icon: 'home' },
    { href: '/student/review', label: 'Review', icon: 'student-review', badge: counts.dueReviews },
    { href: '/student/quests', label: 'Quests', icon: 'quests' },
    { href: '/leaderboard', label: 'Ranks', icon: 'leaderboard' },
    { href: '/notifications', label: 'Inbox', icon: 'inbox', badge: counts.unreadNotifications },
    { href: '/student/my-quests', label: 'My Quests', icon: 'my-quests' },
    { href: '/student/library', label: 'Library', icon: 'library' },
  ];
}
