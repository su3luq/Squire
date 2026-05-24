import {
  Home,
  BookOpen,
  Users,
  Target,
  ClipboardCheck,
  BarChart3,
  Bell,
  Library,
  Trophy,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
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
    { href: '/teacher', label: 'Home', icon: Home },
    { href: '/teacher/quests', label: 'Quests', icon: Target },
    { href: '/teacher/review', label: 'Review', icon: ClipboardCheck, badge: counts.pendingReviews },
    { href: '/teacher/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/notifications', label: 'Inbox', icon: Bell, badge: counts.unreadNotifications },
    { href: '/teacher/lessons', label: 'Lessons', icon: BookOpen },
    { href: '/teacher/classes', label: 'Classes', icon: Users },
  ];
}

export function getStudentNav(counts: StudentCounts): NavItem[] {
  return [
    { href: '/student', label: 'Home', icon: Home },
    { href: '/student/review', label: 'Review', icon: BookOpen, badge: counts.dueReviews },
    { href: '/student/quests', label: 'Quests', icon: Target },
    { href: '/student/leaderboard', label: 'Ranks', icon: Trophy },
    { href: '/notifications', label: 'Inbox', icon: Bell, badge: counts.unreadNotifications },
    { href: '/student/my-quests', label: 'My Quests', icon: ListChecks },
    { href: '/student/library', label: 'Library', icon: Library },
  ];
}
