'use server';

import { createClient } from '@/lib/supabase/server';

export type RegisterPayload = {
  classId: string;
  fullName: string;
  age: number;
  email: string;
  password: string;
};

type RegisterStudentResult = { ok: true } | { ok: false; error: string };

export async function registerStudentAction(payload: RegisterPayload): Promise<{ error: string | null }> {
  const supabase = await createClient();

  // 1. Create the auth.users row with the user's real email.
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: payload.email,
    password: payload.password,
  });
  if (authError) return { error: authError.message };
  if (!authData.user) return { error: 'Sign-up succeeded but no user returned.' };

  // 2. Call the gated register_student RPC to insert the profile row.
  // Server-side gates: caller identity (auth.uid), registration_open, class exists.
  const { data, error: rpcError } = await supabase.rpc('register_student', {
    p_user_id: authData.user.id,
    p_full_name: payload.fullName,
    p_age: payload.age,
    p_email: payload.email,
    p_class_id: payload.classId,
  });

  if (rpcError) {
    return { error: `Registration RPC failed: ${rpcError.message}` };
  }

  const result = data as RegisterStudentResult;
  if (!result.ok) {
    return { error: result.error };
  }

  return { error: null };
}
