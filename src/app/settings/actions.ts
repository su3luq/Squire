'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

type Result = { error: string | null };

// Verify the supplied current password by attempting to sign in with
// the user's email + that password. This isn't ideal (it rotates the
// session) but Supabase has no first-class reauth-verify endpoint.
async function reauth(email: string, password: string): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return 'Current password is incorrect.';
  return null;
}

export async function updatePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<Result> {
  if (input.newPassword.length < 6) {
    return { error: 'New password must be at least 6 characters.' };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'Not authenticated.' };

  const reauthError = await reauth(user.email, input.currentPassword);
  if (reauthError) return { error: reauthError };

  const { error } = await supabase.auth.updateUser({
    password: input.newPassword,
  });
  if (error) return { error: error.message };

  return { error: null };
}

export async function updateEmail(input: {
  currentPassword: string;
  newEmail: string;
}): Promise<Result> {
  const newEmail = input.newEmail.trim().toLowerCase();
  if (!newEmail.includes('@')) {
    return { error: 'Please enter a valid email.' };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'Not authenticated.' };
  if (newEmail === user.email) {
    return { error: 'That is already your current email.' };
  }

  const reauthError = await reauth(user.email, input.currentPassword);
  if (reauthError) return { error: reauthError };

  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (error) return { error: error.message };

  revalidatePath('/settings');
  return { error: null };
}

// Client uploads the file to Storage directly. The server action here is
// just used to set profiles.avatar_url after the upload finishes — but
// we don't currently need it because the upload helper does the
// profiles update itself. Kept as a stub in case we want to centralize
// the bookkeeping later.

export async function clearAvatar(): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  await supabase.storage
    .from('avatars')
    .remove([`${user.id}/avatar.webp`]);

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', user.id);
  if (error) return { error: error.message };

  revalidatePath('/settings');
  return { error: null };
}
