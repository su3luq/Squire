'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { addNote, updateNote, deleteNote } from './actions';

type Note = { id: string; note: string; created_at: string; updated_at: string };

const SAIGON_TZ = 'Asia/Ho_Chi_Minh';
function formatSaigon(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: SAIGON_TZ,
  }).format(new Date(iso));
}

export function NotesSection({
  studentId,
  notes,
}: {
  studentId: string;
  notes: Note[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAdding, startAdd] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [isEditing, startEdit] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleAdd() {
    setError(null);
    startAdd(async () => {
      const fd = new FormData();
      fd.append('note', draft);
      const r = await addNote(studentId, fd);
      if (r.error) {
        setError(r.error);
        return;
      }
      setDraft('');
      router.refresh();
    });
  }

  function startEditing(n: Note) {
    setEditingId(n.id);
    setEditText(n.note);
    setError(null);
  }

  function saveEdit() {
    if (!editingId) return;
    setError(null);
    const id = editingId;
    startEdit(async () => {
      const r = await updateNote(id, editText);
      if (r.error) {
        setError(r.error);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    setError(null);
    setDeletingId(id);
    startDelete(async () => {
      const r = await deleteNote(id);
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={isAdding}
          placeholder="Add a note about this student. Teacher-only — students never see this."
          rows={3}
        />
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={handleAdd}
            disabled={isAdding || !draft.trim()}
          >
            {isAdding ? 'Adding...' : 'Add note'}
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-slate-500">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => {
            const editing = editingId === n.id;
            const deleting = deletingId === n.id && isDeleting;
            return (
              <li
                key={n.id}
                className="rounded-md border border-slate-200 p-3 text-sm"
              >
                {editing ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      disabled={isEditing}
                      rows={3}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingId(null)}
                        disabled={isEditing}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={saveEdit}
                        disabled={isEditing || !editText.trim()}
                      >
                        {isEditing ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-slate-800">
                      {n.note}
                    </p>
                    <div className="mt-2 flex items-baseline justify-between gap-2 text-xs text-slate-400">
                      <span>
                        {formatSaigon(n.created_at)}
                        {n.updated_at !== n.created_at &&
                          ` · edited ${formatSaigon(n.updated_at)}`}
                      </span>
                      <span className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEditing(n)}
                          className="text-blue-600 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(n.id)}
                          disabled={deleting}
                          className="text-red-600 hover:underline disabled:opacity-50"
                        >
                          {deleting ? 'Deleting...' : 'Delete'}
                        </button>
                      </span>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
