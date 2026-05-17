import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '../database.types';

// Used in CLIENT components ('use client' files).
// For server-side code (server components, route handlers, server actions), use server.ts instead.
//
// IMPORTANT — Two table-access patterns coexist by design:
//   - .from('profiles') for teacher reads (full columns) and student self-reads
//   - .from('public_profiles') for student reads of OTHER students (leaderboard, classmates)
//     This view excludes columns that shouldn't be visible to students.
// Teacher-only metadata (English proficiency, etc.) lives in student_assessments table,
// teacher-only via RLS. Never query it from student code paths.
// See CLAUDE.md "Privacy Model" table and docs/SCHEMA.md.

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
