'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export type TeamNote = {
  noteId: string;
  studentId: string;
  studentName: string;
  body: string;
  updatedAt: string;
};

type Props = {
  instanceId: string;
  viewerId: string;
  initialNotes: TeamNote[];
  editable: boolean;
};

// Auto-save cadence — matches the doc: 1.5s debounce + pagehide flush.
const DEBOUNCE_MS = 1500;

export function TeamNotesSidebar({
  instanceId,
  viewerId,
  initialNotes,
  editable,
}: Props) {
  const [notes, setNotes] = useState<TeamNote[]>(initialNotes);
  const ownNote = notes.find((n) => n.studentId === viewerId) ?? null;
  const [ownBody, setOwnBody] = useState(ownNote?.body ?? '');
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [savingState, setSavingState] = useState<
    'idle' | 'pending' | 'saving' | 'saved'
  >('idle');

  const supabase = createClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const latestBodyRef = useRef(ownBody);

  useEffect(() => {
    latestBodyRef.current = ownBody;
  }, [ownBody]);

  const persistNote = useCallback(
    async (body: string) => {
      if (!ownNote) return;
      setSavingState('saving');
      const { error } = await supabase
        .from('coop_team_notes')
        .update({ body })
        .eq('id', ownNote.noteId);
      if (error) {
        console.error('Failed to save team note', error);
        setSavingState('idle');
        return;
      }
      dirtyRef.current = false;
      setSavingState('saved');
      // Reset saved indicator after a moment.
      setTimeout(() => {
        setSavingState((s) => (s === 'saved' ? 'idle' : s));
      }, 1500);
    },
    [ownNote, supabase],
  );

  function handleBodyChange(next: string) {
    setOwnBody(next);
    if (!editable || !ownNote) return;
    dirtyRef.current = true;
    setSavingState('pending');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      persistNote(latestBodyRef.current);
    }, DEBOUNCE_MS);
  }

  // Flush any pending save on page hide / tab switch.
  useEffect(() => {
    function flush() {
      if (!dirtyRef.current || !ownNote) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      // Fire and forget — we can't await during pagehide.
      persistNote(latestBodyRef.current);
    }
    function onVisibility() {
      if (document.visibilityState === 'hidden') flush();
    }
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [ownNote, persistNote]);

  // Realtime: subscribe to teammate updates. Skip our own echo to avoid
  // overwriting the in-progress local edit.
  useEffect(() => {
    const channel = supabase
      .channel(`team-notes-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'coop_team_notes',
          filter: `instance_id=eq.${instanceId}`,
        },
        (payload) => {
          const updated = payload.new as {
            id: string;
            body: string;
            student_id: string;
            updated_at: string;
          };
          if (updated.student_id === viewerId) return;
          setNotes((prev) =>
            prev.map((n) =>
              n.noteId === updated.id
                ? { ...n, body: updated.body, updatedAt: updated.updated_at }
                : n,
            ),
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [instanceId, viewerId, supabase]);

  const otherNotes = notes.filter((n) => n.studentId !== viewerId);

  return (
    <>
      {/* Desktop collapse-handle (visible only when sidebar is closed) */}
      {!desktopOpen && (
        <button
          type="button"
          onClick={() => setDesktopOpen(true)}
          className="hidden lg:fixed lg:right-4 lg:top-24 lg:z-30 lg:flex lg:items-center lg:gap-2 lg:rounded-l-md lg:rounded-r-md lg:border lg:border-border lg:bg-card lg:px-3 lg:py-2 lg:text-sm lg:shadow-sm lg:hover:bg-muted"
        >
          <MessageSquare className="h-4 w-4" />
          Team notes ({notes.length})
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      {/* Desktop sidebar (sticky right column) */}
      <aside
        className={cn(
          'hidden lg:block lg:shrink-0',
          desktopOpen ? 'lg:w-[340px]' : 'lg:hidden',
        )}
      >
        <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto rounded-lg border border-border bg-muted/40 p-4">
          <header className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Team notes</h3>
            </div>
            <button
              type="button"
              onClick={() => setDesktopOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-card hover:text-foreground"
              aria-label="Hide team notes"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </header>

          <NotesBody
            ownNote={ownNote}
            ownBody={ownBody}
            otherNotes={otherNotes}
            editable={editable}
            savingState={savingState}
            onChange={handleBodyChange}
          />
        </div>
      </aside>

      {/* Mobile: floating pill at bottom, opens sheet */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-md hover:bg-muted lg:hidden"
      >
        <MessageSquare className="h-4 w-4" />
        Team notes ({notes.length})
      </button>

      {/* Mobile bottom sheet */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 flex flex-col justify-end lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Team notes</h3>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close team notes"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <NotesBody
              ownNote={ownNote}
              ownBody={ownBody}
              otherNotes={otherNotes}
              editable={editable}
              savingState={savingState}
              onChange={handleBodyChange}
            />
          </div>
        </div>
      )}
    </>
  );
}

function NotesBody({
  ownNote,
  ownBody,
  otherNotes,
  editable,
  savingState,
  onChange,
}: {
  ownNote: TeamNote | null;
  ownBody: string;
  otherNotes: TeamNote[];
  editable: boolean;
  savingState: 'idle' | 'pending' | 'saving' | 'saved';
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-foreground">Your note</span>
          <SaveIndicator state={savingState} />
        </div>
        {ownNote ? (
          <Textarea
            value={ownBody}
            onChange={(e) => onChange(e.target.value)}
            disabled={!editable}
            placeholder="Share thoughts, links, or questions with your team. Auto-saves."
            rows={5}
            className="resize-y bg-card text-sm"
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            You don&apos;t have a note row for this team yet.
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          Visible to teammates now, and to your teacher after submission.
        </p>
      </div>

      {otherNotes.length > 0 && (
        <div className="space-y-3 border-t border-border pt-4">
          {otherNotes.map((n) => (
            <article
              key={n.noteId}
              className="rounded-md border border-border bg-card p-3"
            >
              <header className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-foreground">
                  {n.studentName}
                </span>
                <RelativeTime iso={n.updatedAt} />
              </header>
              {n.body.trim() ? (
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {n.body}
                </p>
              ) : (
                <p className="text-xs italic text-muted-foreground">
                  (empty)
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function SaveIndicator({
  state,
}: {
  state: 'idle' | 'pending' | 'saving' | 'saved';
}) {
  if (state === 'idle') return null;
  const label =
    state === 'pending' ? 'Editing…' : state === 'saving' ? 'Saving…' : 'Saved';
  return (
    <span className="text-[11px] text-muted-foreground">{label}</span>
  );
}

function RelativeTime({ iso }: { iso: string }) {
  // Static client-side computation. No need to update — re-render on
  // any state change shows a fresh relative timestamp.
  // eslint-disable-next-line react-hooks/purity -- intentional per render
  const now = Date.now();
  const ts = new Date(iso).getTime();
  const diff = now - ts;
  let label: string;
  if (diff < 60_000) label = 'just now';
  else if (diff < 3_600_000) label = `${Math.floor(diff / 60_000)}m ago`;
  else if (diff < 86_400_000) label = `${Math.floor(diff / 3_600_000)}h ago`;
  else label = `${Math.floor(diff / 86_400_000)}d ago`;
  return (
    <time
      dateTime={iso}
      className="text-[11px] text-muted-foreground"
      title={new Date(iso).toLocaleString()}
    >
      {label}
    </time>
  );
}
