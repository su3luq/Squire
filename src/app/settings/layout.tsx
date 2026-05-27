import { AppShell } from '@/components/app-shell';
import { getShellData } from '@/lib/app-shell-data';

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = await getShellData();
  return (
    <AppShell {...data}>
      {children}
    </AppShell>
  );
}
