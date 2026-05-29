'use client';

import { ConfirmButton } from '@/components/confirm-button';
import { deleteStudent } from './actions';

export function DeleteStudentButton({
  studentId,
  fromClassId,
  studentName,
  activeTeamCount,
}: {
  studentId: string;
  fromClassId: string;
  studentName: string;
  activeTeamCount: number;
}) {
  return (
    <ConfirmButton
      label="Delete student"
      pendingLabel="Deleting…"
      confirmLabel="Delete forever"
      title={`Delete ${studentName}?`}
      description={
        <>
          This permanently removes the student account and all their data (XP
          history, reviews, quest acceptances, submissions, notes,
          assessments). Cannot be undone.
          {activeTeamCount > 0 && (
            <span className="mt-2 block font-medium text-amber-800">
              Heads up: this student is on {activeTeamCount} active co-op{' '}
              {activeTeamCount === 1 ? 'team' : 'teams'}. Those teams will be
              left a member short — consider disbanding them first.
            </span>
          )}
        </>
      }
      action={() => deleteStudent(studentId, fromClassId)}
    />
  );
}
