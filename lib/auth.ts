import { supabase } from './supabase';

const EMAIL_SHIM_DOMAIN = 'squire.local';

// Convert a username to the internal email Supabase Auth uses.
// Users never see this email; it's a workaround for Supabase requiring email-based auth.
export function usernameToEmail(username: string): string {
  return `${username.toLowerCase().trim()}@${EMAIL_SHIM_DOMAIN}`;
}

// Reverse: extract username from an internal email (used to display username from session)
export function emailToUsername(email: string): string {
  return email.replace(`@${EMAIL_SHIM_DOMAIN}`, '');
}

// Validate username format. Rules: 3-30 chars, alphanumeric + underscore, must start with letter.
export function validateUsername(username: string): { ok: true } | { ok: false; reason: string } {
  if (username.length < 3) return { ok: false, reason: 'Username must be at least 3 characters.' };
  if (username.length > 30) return { ok: false, reason: 'Username must be 30 characters or fewer.' };
  if (!/^[a-z][a-z0-9_]*$/i.test(username)) {
    return { ok: false, reason: 'Username must start with a letter and contain only letters, numbers, and underscores.' };
  }
  return { ok: true };
}

// Check both format AND availability against the DB.
export async function checkUsernameAvailable(username: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const fmt = validateUsername(username);
  if (!fmt.ok) return fmt;

  const { data, error } = await supabase.rpc('is_username_available', { uname: username.toLowerCase() });
  if (error) return { ok: false, reason: `Could not check username: ${error.message}` };
  if (data === false) return { ok: false, reason: 'Username is already taken.' };
  return { ok: true };
}

// Look up a class by invite code. Returns null if invalid/expired.
export async function lookupClass(inviteCode: string): Promise<{ id: string; name: string } | null> {
  const trimmed = inviteCode.trim().toUpperCase();
  if (!trimmed) return null;
  const { data, error } = await supabase.rpc('lookup_class_by_invite', { code: trimmed });
  if (error || !data || data.length === 0) return null;
  return { id: data[0].id, name: data[0].name };
}

// Sign in with username + password.
export async function signInWithUsername(username: string, password: string) {
  const email = usernameToEmail(username);
  return supabase.auth.signInWithPassword({ email, password });
}

// Sign up a new student. After auth.signUp succeeds, immediately insert the profile row.
// Returns { error } on any failure (auth or profile insert).
export type StudentRegistration = {
  username: string;
  password: string;
  displayName: string;
  fullName: string;
  age: number;
  classId: string;
  email?: string;
  interestTags?: string[];
  avatarUrl?: string;
};

export async function registerStudent(reg: StudentRegistration): Promise<{ error: Error | null }> {
  const email = usernameToEmail(reg.username);

  // 1. Create the auth user.
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password: reg.password,
  });
  if (authError) return { error: authError };
  if (!authData.user) return { error: new Error('Sign up succeeded but no user returned.') };

  // 2. Insert the profile. RLS policy requires id = auth.uid() and role = 'student'.
  const { error: profileError } = await supabase.from('profiles').insert({
    id: authData.user.id,
    role: 'student',
    username: reg.username.toLowerCase(),
    display_name: reg.displayName.trim(),
    full_name: reg.fullName.trim(),
    age: reg.age,
    class_id: reg.classId,
    email: reg.email?.trim() || null,
    interest_tags: reg.interestTags ?? [],
    avatar_url: reg.avatarUrl ?? null,
  });

  if (profileError) {
    // Profile insert failed; the auth user exists but is orphaned.
    // The user will see "username taken" or similar on retry. Logging for now.
    console.error('Profile insert failed after signup:', profileError);
    return { error: new Error(`Account created but profile failed: ${profileError.message}`) };
  }

  return { error: null };
}

export async function signOut(): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.signOut();
  return { error };
}
