'use client';

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
  Brain,
  type LucideIcon,
} from 'lucide-react';
import type { NavIconKey } from './nav-items';

const ICON_REGISTRY: Record<NavIconKey, LucideIcon> = {
  home: Home,
  quests: Target,
  review: ClipboardCheck,
  analytics: BarChart3,
  inbox: Bell,
  lessons: BookOpen,
  classes: Users,
  'student-review': Brain,
  leaderboard: Trophy,
  'my-quests': ListChecks,
  library: Library,
};

export function NavIcon({
  name,
  className,
}: {
  name: NavIconKey;
  className?: string;
}) {
  const Icon = ICON_REGISTRY[name];
  return <Icon className={className} />;
}
