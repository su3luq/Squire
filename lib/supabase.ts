import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// NOTE: Two table-access patterns coexist by design:
//   - `supabase.from('profiles')` — for self/teacher reads with full column access (RLS-gated)
//   - `supabase.from('public_profiles')` — security-barrier view for non-self student reads
//     (excludes teacher-only columns like english_proficiency_*).
// Pick the right one per query. See docs/PLAN.md §4.
// `Database` type will be generated and added once the schema is finalized; for now we use `any`.

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
