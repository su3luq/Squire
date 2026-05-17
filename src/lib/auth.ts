import { createClient } from './supabase/client';

// Auth is email + password. No username shim — Supabase Auth uses the user's real email
// directly. The username column was removed in migration 010; full_name is the public display.

export async function signInWithEmail(email: string, password: string) {
  const supabase = createClient();
  return supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
}

export async function signOut() {
  const supabase = createClient();
  return supabase.auth.signOut();
}

// registerStudent intentionally lives in app/register/actions.ts (server action)
// so the registration_open check runs server-side via the register_student RPC.
