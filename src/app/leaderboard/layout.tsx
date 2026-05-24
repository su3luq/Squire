import { AppShell } from '@/components/app-shell';
import { getShellData } from '@/lib/app-shell-data';

export default async function LeaderboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const shell = await getShellData();
  return <AppShell {...shell}>{children}</AppShell>;
}
