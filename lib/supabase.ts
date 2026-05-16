import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// IMPORTANT — Two table-access patterns coexist by design:
//   - `supabase.from('profiles')` for teacher reads (full columns) and student self-reads
//   - `supabase.from('public_profiles')` for student reads of OTHER students (leaderboard, classmates)
//     This view excludes columns that shouldn't be visible to students.
// Teacher-only metadata (English proficiency, etc.) lives in `student_assessments` table,
// which has its own teacher-only RLS policy. Never query it from student code paths.
// See CLAUDE.md "Privacy Model" table and docs/SCHEMA.md for the authoritative list.

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
