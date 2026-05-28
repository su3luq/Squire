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

// Avatar storage strategy: the browser resizes to a 256x256 webp blob
// (~30-50 KB), POSTs it here as FormData, and we encode it as a
// base64 data URL in profiles.avatar_url. Supabase Storage on this
// project rejects every authenticated upload at the storage-service
// layer (Postgres simulations of the same INSERT succeed), so we
// bypass storage entirely and use the profiles table — which has
// working RLS.

const AVATAR_MAX_BYTES = 200 * 1024;

type AvatarUploadResult = { error: string | null; publicUrl?: string };

export async function uploadAvatar(
  formData: FormData,
): Promise<AvatarUploadResult> {
  const blob = formData.get('file');
  if (!(blob instanceof Blob)) return { error: 'Missing file.' };
  if (blob.type !== 'image/webp') {
    return { error: 'Unsupported file type.' };
  }
  if (blob.size > AVATAR_MAX_BYTES) {
    return { error: 'Image too large after resize.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const buffer = Buffer.from(await blob.arrayBuffer());
  const dataUrl = `data:image/webp;base64,${buffer.toString('base64')}`;

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: dataUrl })
    .eq('id', user.id);
  if (profileError) return { error: profileError.message };

  revalidatePath('/settings');
  return { error: null, publicUrl: dataUrl };
}

export async function clearAvatar(): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', user.id);
  if (error) return { error: error.message };

  revalidatePath('/settings');
  return { error: null };
}
