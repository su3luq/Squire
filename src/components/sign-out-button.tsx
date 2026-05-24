'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { signOut } from '@/lib/auth';
import { Button } from '@/components/ui/button';

export function SignOutButton() {
  const router = useRouter();
  async function handleSignOut() {
    await signOut();
    router.refresh();
  }
  return (
    <Button variant="outline" size="sm" className="w-full justify-start" onClick={handleSignOut}>
      <LogOut className="h-4 w-4" />
      Sign out
    </Button>
  );
}
