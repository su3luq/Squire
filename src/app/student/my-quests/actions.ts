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
