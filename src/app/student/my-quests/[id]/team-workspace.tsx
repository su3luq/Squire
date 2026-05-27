'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Users } from 'lucide-react';
import { MdxEditor } from '@/components/mdx-editor';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { saveMemberDraft, toggleMemberDraftSubmit } from '../actions';

export type DraftMember = {
  draftId: string;
  studentId: string;
  fullName: string;
  bodyMd: string;
  submittedAt: string | null;
};

type Props = {
  instanceId: string;
  questId: string;
  members: DraftMember[];
  viewerId: string;
  /** False when the instance is no longer 'active' (submitted / passed). */
  editable: boolean;
};

export function TeamWorkspace({
  instanceId,
  questId,
  members,
  viewerId,
  editable,
}: Props) {
  const router = useRouter();
  const ownMember =
    members.find((m) => m.studentId === viewerId) ?? members[0];
  const [activeId, setActiveId] = useState(ownMember?.studentId ?? viewerId);
  const [draftBody, setDraftBody] = useState(ownMember?.bodyMd ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isToggling, startToggle] = useTransition();

  const active =
    members.find((m) => m.studentId === activeId) ?? ownMember;
  const isOwn = active?.studentId === viewerId;
  const ownSubmitted = ownMember?.submittedAt != null;
  const submittedCount = members.filter((m) => m.submittedAt != null).length;
  const totalMembers = members.length;

  async function handleSaveDraft() {
    setError(null);
    setIsSaving(true);
    const r = await saveMemberDraft({ instanceId, bodyMd: draftBody });
    setIsSaving(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    router.refresh();
  }

  function handleToggleSubmit() {
    setError(null);
    startToggle(async () => {
      // If submitting, persist any unsaved edits first so the finalized
      // submission reflects current text.
      if (!ownSubmitted) {
        const saveResult = await saveMemberDraft({ instanceId, bodyMd: draftBody });
        if (saveResult.error) {
          setError(saveResult.error);
          return;
        }
      }
      const r = await toggleMemberDraftSubmit({
        instanceId,
        questId,
        submitted: !ownSubmitted,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Member switcher + status counter */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <label htmlFor="member-select" className="sr-only">
            View a teammate&apos;s draft
          </label>
          <select
            id="member-select"
            value={activeId}
            onChange={(e) => setActiveId(e.target.value)}
            className="rounded-md border border-input bg-card px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {members.map((m) => (
              <option key={m.studentId} value={m.studentId}>
                {m.studentId === viewerId ? `${m.fullName} (you)` : m.fullName}
                {m.submittedAt ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 font-medium',
              submittedCount === totalMembers
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {submittedCount} of {totalMembers} submitted
          </span>
        </div>
      </div>

      {/* Active draft pane */}
      {isOwn && editable ? (
        <div className="space-y-3">
          <MdxEditor
            value={draftBody}
            onChange={setDraftBody}
            editable={!isToggling && !ownSubmitted}
            minHeight="420px"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!ownSubmitted && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSaveDraft}
                disabled={isSaving || isToggling}
              >
                {isSaving ? 'Saving…' : 'Save draft'}
              </Button>
            )}
            <Button
              type="button"
              onClick={handleToggleSubmit}
              disabled={isToggling}
              variant={ownSubmitted ? 'outline' : 'default'}
            >
              {isToggling
                ? '…'
                : ownSubmitted
                  ? 'Un-submit'
                  : 'Submit my draft'}
            </Button>
          </div>
          {ownSubmitted && submittedCount < totalMembers && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              You&apos;re done. Waiting on {totalMembers - submittedCount} other{' '}
              {totalMembers - submittedCount === 1 ? 'member' : 'members'} to
              submit before the team&apos;s work is sent for review.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {active?.fullName}
              {isOwn ? ' (you)' : ''}
            </span>
            {active?.submittedAt && (
              <span className="flex items-center gap-1 text-primary">
                <Check className="h-3.5 w-3.5" />
                Submitted
              </span>
            )}
          </div>
          {active?.bodyMd?.trim() ? (
            <MarkdownRenderer source={active.bodyMd} />
          ) : (
            <p className="text-sm italic text-muted-foreground">
              {isOwn ? "You haven't written anything yet." : "Nothing here yet."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
