'use client';

import { useRouter } from 'next/navigation';
import { ConfirmButton } from '@/components/confirm-button';
import { buttonVariants } from '@/components/ui/button';
import { disbandQuest } from './actions';

export function DisbandQuestButton({
  questId,
  affectedStudents,
  affectedTeams,
}: {
  questId: string;
  affectedStudents: number;
  affectedTeams: number;
}) {
  const router = useRouter();
  const nothingToDo = affectedStudents === 0 && affectedTeams === 0;

  if (nothingToDo) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          disabled
          className={buttonVariants({ variant: 'outline' })}
        >
          Disband quest
        </button>
        <p className="text-xs text-muted-foreground">
          Nothing to disband — no in-flight work on this quest.
        </p>
      </div>
    );
  }

  return (
    <ConfirmButton
      label="Disband quest"
      pendingLabel="Disbanding…"
      confirmLabel="Disband everything"
      title="Disband this quest?"
      variant="outline"
      description={
        <>
          This removes all in-flight work on the quest:{' '}
          <span className="font-medium">
            {affectedStudents} {affectedStudents === 1 ? 'student' : 'students'}
          </span>{' '}
          will be removed from the quest
          {affectedTeams > 0 && (
            <>
              {' '}
              and{' '}
              <span className="font-medium">
                {affectedTeams} {affectedTeams === 1 ? 'team' : 'teams'}
              </span>{' '}
              will be deleted
            </>
          )}
          . They can re-enroll if the quest is still open and the matchmaking
          deadline hasn&apos;t passed. Already-passed work is preserved.
          Cannot be undone.
        </>
      }
      helperText="Cancels active/enrolled/submitted work. Doesn't close the quest — new accepts/enrollments still possible unless you also click Close."
      action={() => disbandQuest(questId)}
      onSuccess={() => router.refresh()}
    />
  );
}
