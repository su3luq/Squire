'use client';

import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth';
import { Button } from '@/components/ui/button';

export default function SignOutButton() {
  const router = useRouter();
  async function handleSignOut() {
    await signOut();
    router.refresh();
  }
  return (
    <Button variant="outline" onClick={handleSignOut}>
      Sign out
    </Button>
  );
}
