'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateEmail } from './actions';

export function EmailSettings({ currentEmail }: { currentEmail: string }) {
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!newEmail.includes('@')) {
      setError('Please enter a valid email.');
      return;
    }
    startTransition(async () => {
      const r = await updateEmail({ currentPassword, newEmail });
      if (r.error) {
        setError(r.error);
        return;
      }
      setMessage(
        'Confirmation links sent to both your current and new email addresses. The change takes effect once you confirm on your new address.',
      );
      setNewEmail('');
      setCurrentPassword('');
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="current-email-display">Current email</Label>
        <Input
          id="current-email-display"
          type="email"
          value={currentEmail}
          disabled
          readOnly
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-email">New email</Label>
        <Input
          id="new-email"
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          autoComplete="email"
          disabled={isPending}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="current-password-email">Confirm with current password</Label>
        <Input
          id="current-password-email"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          disabled={isPending}
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && (
        <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
          {message}
        </div>
      )}
      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={isPending || !newEmail || !currentPassword}
        >
          {isPending ? 'Sending…' : 'Change email'}
        </Button>
      </div>
    </form>
  );
}
