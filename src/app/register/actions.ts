'use server';

import { createClient } from '@/lib/supabase/server';
import { usernameToEmail } from '@/lib/auth';

export type RegisterPayload = {
  classId: string;
  username: string;
  displayName: string;
  fullName: string;
  age: number;
  email: string;
  password: string;
};

export async function registerStudentAction(payload: RegisterPayload): Promise<{ error: string | null }> {
  const supabase = await createClient();

  // TODO (after migration 009 lands): call the SECURITY DEFINER register_student function
  // which enforces the registration_open check server-side. For now, perform the
  // signup + profile insert directly. This is a temporary placeholder until 009.

  const email = usernameToEmail(payload.username);
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password: payload.password,
  });
  if (authError) return { error: authError.message };
  if (!authData.user) return { error: 'Sign-up succeeded but no user returned.' };

  const { error: profileError } = await supabase.from('profiles').insert({
    id: authData.user.id,
    role: 'student',
    username: payload.username,
    display_name: payload.displayName,
    full_name: payload.fullName,
    age: payload.age,
    email: payload.email,
    class_id: payload.classId,
  });

  if (profileError) {
    return { error: `Account created but profile failed: ${profileError.message}` };
  }

  return { error: null };
}
