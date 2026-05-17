import { createClient } from './supabase/client';

const EMAIL_SHIM_DOMAIN = 'squire.local';

export function usernameToEmail(username: string): string {
  return `${username.toLowerCase().trim()}@${EMAIL_SHIM_DOMAIN}`;
}

export function emailToUsername(email: string): string {
  return email.replace(`@${EMAIL_SHIM_DOMAIN}`, '');
}

export function validateUsername(username: string): { ok: true } | { ok: false; reason: string } {
  if (username.length < 3) return { ok: false, reason: 'Username must be at least 3 characters.' };
  if (username.length > 30) return { ok: false, reason: 'Username must be 30 characters or fewer.' };
  if (!/^[a-z][a-z0-9_]*$/i.test(username)) {
    return { ok: false, reason: 'Username must start with a letter and contain only letters, numbers, and underscores.' };
  }
  return { ok: true };
}

export async function checkUsernameAvailable(username: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const fmt = validateUsername(username);
  if (!fmt.ok) return fmt;
  const supabase = createClient();
  const { data, error } = await supabase.rpc('is_username_available', { uname: username.toLowerCase() });
  if (error) return { ok: false, reason: `Could not check username: ${error.message}` };
  if (data === false) return { ok: false, reason: 'Username is already taken.' };
  return { ok: true };
}

export async function signInWithUsername(username: string, password: string) {
  const supabase = createClient();
  const email = usernameToEmail(username);
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  const supabase = createClient();
  return supabase.auth.signOut();
}

// registerStudent intentionally removed from this file.
// The new registration flow uses a Server Action (see app/register/actions.ts) so the
// registration_open check is enforced server-side.
