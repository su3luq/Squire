'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { signOut } from '@/lib/auth';
import { Button } from '@/components/ui/button';

export function SignOutButton({ iconOnly = false }: { iconOnly?: boolean } = {}) {
  const router = useRouter();
  async function handleSignOut() {
    await signOut();
    router.refresh();
  }
  if (iconOnly) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleSignOut}
        title="Sign out"
        aria-label="Sign out"
        className="h-9 w-9"
      >
        <LogOut className="h-4 w-4" />
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full justify-start"
      onClick={handleSignOut}
    >
      <LogOut className="h-4 w-4" />
      Sign out
    </Button>
  );
}
