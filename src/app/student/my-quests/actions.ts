'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

type SubmitResult = {
  ok: boolean;
  error?: string;
  submission_id?: string;
  word_count?: number;
};

export async function submitQuest(input: {
  questId: string;
  acceptanceId: string | null;
  instanceId: string | null;
  textContent: string;
}): Promise<{
  error: string | null;
  submission_id?: string;
  word_count?: number;
}> {
  if (!input.textContent.trim()) {
    return { error: 'Your submission is empty.' };
  }
  if ((input.acceptanceId === null) === (input.instanceId === null)) {
    return {
      error:
        'Internal error: exactly one of acceptance or instance must be provided.',
    };
  }

  const supabase = await createClient();
  // The generated types declare p_acceptance_id / p_instance_id as `string`
  // but the SQL function accepts NULL for the other side of the XOR — cast
  // through unknown so we can pass null without weakening the rest of the
  // call site.
  const { data, error } = await supabase.rpc('submit_quest', {
    p_acceptance_id: input.acceptanceId as unknown as string,
    p_instance_id: input.instanceId as unknown as string,
    p_text_content: input.textContent,
  });
  if (error) return { error: `Server error: ${error.message}` };
  const result = data as SubmitResult;
  if (!result.ok) return { error: result.error ?? 'Submission failed.' };

  revalidatePath(`/student/my-quests/${input.questId}`);
  revalidatePath('/student/my-quests');
  return {
    error: null,
    submission_id: result.submission_id,
    word_count: result.word_count,
  };
}

// Phase 8: per-member draft actions for co-op quests. Drafts live in the
// coop_member_drafts table; RLS gates writes (own row + active instance
// only). The auto-finalize trigger fires when submitted_at is set on the
// last member's row.

export async function saveMemberDraft(input: {
  instanceId: string;
  bodyMd: string;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const { error } = await supabase
    .from('coop_member_drafts')
    .update({ body_md: input.bodyMd })
    .eq('instance_id', input.instanceId)
    .eq('student_id', user.id);
  if (error) return { error: `Save failed: ${error.message}` };
  return { error: null };
}

export async function toggleMemberDraftSubmit(input: {
  instanceId: string;
  questId: string;
  submitted: boolean;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const { error } = await supabase
    .from('coop_member_drafts')
    .update({ submitted_at: input.submitted ? new Date().toISOString() : null })
    .eq('instance_id', input.instanceId)
    .eq('student_id', user.id);
  if (error) return { error: `Update failed: ${error.message}` };

  revalidatePath(`/student/my-quests/${input.questId}`);
  return { error: null };
}
