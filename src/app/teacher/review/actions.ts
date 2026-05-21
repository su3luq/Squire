'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

type RpcResult = {
  ok: boolean;
  error?: string;
  xp_awarded?: number;
  members_affected?: number;
};

export async function reviewSubmission(input: {
  submissionId: string;
  pass: boolean;
  feedback: string;
}): Promise<{
  error: string | null;
  xp_awarded?: number;
  members_affected?: number;
}> {
  if (!input.pass && !input.feedback.trim()) {
    return { error: 'Feedback is required when failing a submission.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('review_submission', {
    p_submission_id: input.submissionId,
    p_pass: input.pass,
    p_feedback: input.feedback,
  });
  if (error) return { error: `Server error: ${error.message}` };
  const result = data as RpcResult;
  if (!result.ok) return { error: result.error ?? 'Review failed.' };

  revalidatePath('/teacher/review');
  revalidatePath(`/teacher/review/${input.submissionId}`);
  revalidatePath('/teacher/quests');
  return {
    error: null,
    xp_awarded: result.xp_awarded,
    members_affected: result.members_affected,
  };
}
