import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EditClassForm } from './edit-class-form';
import { RegistrationToggle } from './registration-toggle';
import { ArchiveButton } from './archive-button';

export const dynamic = 'force-dynamic';

const SAIGON_TZ = 'Asia/Ho_Chi_Minh';

function formatSaigon(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: SAIGON_TZ,
  }).format(new Date(iso));
}

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: cls } = await supabase
    .from('classes')
    .select('id, name, registration_open, archived_at, created_at')
    .eq('id', id)
    .maybeSingle();

  if (!cls) notFound();

  const { data: students } = await supabase
    .from('profiles')
    .select(
      'id, full_name, age, email, xp_total, current_rank, learning_velocity, last_active_at, created_at'
    )
    .eq('class_id', id)
    .eq('role', 'student')
    .order('full_name');

  const isArchived = cls.archived_at !== null;

  return (
    <main className="container mx-auto max-w-4xl p-6">
      <Link
        href="/teacher/classes"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Classes
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-bold">{cls.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          {isArchived ? (
            <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
              Archived
            </span>
          ) : cls.registration_open ? (
            <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
              Registration open
            </span>
          ) : (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              Registration closed
            </span>
          )}
          <span className="text-xs">
            {(students ?? []).length}{' '}
            {(students ?? []).length === 1 ? 'student' : 'students'}
          </span>
        </div>
      </div>

      <div className="space-y-6">
        {/* Students */}
        <Card>
          <CardHeader>
            <CardTitle>Students ({(students ?? []).length})</CardTitle>
          </CardHeader>
          <CardContent>
            {(students ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">
                No students in this class yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
                {(students ?? []).map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/teacher/classes/${id}/students/${s.id}`}
                      className="block px-3 py-3 transition-colors hover:bg-slate-50"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-900">
                            {s.full_name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {s.age ? `${s.age}y · ` : ''}
                            {s.email}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-600">
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">
                            Rank {s.current_rank}
                          </span>
                          <span className="tabular-nums">
                            {s.xp_total.toLocaleString()} XP
                          </span>
                          <span className="tabular-nums">
                            v {Number(s.learning_velocity ?? 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                      {s.last_active_at && (
                        <p className="mt-1 text-xs text-slate-400">
                          Last active {formatSaigon(s.last_active_at)}
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Edit name */}
        <Card>
          <CardHeader>
            <CardTitle>Name</CardTitle>
          </CardHeader>
          <CardContent>
            <EditClassForm classId={cls.id} initialName={cls.name} />
          </CardContent>
        </Card>

        {/* Registration toggle + archive */}
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RegistrationToggle
              classId={cls.id}
              isOpen={cls.registration_open}
              isArchived={isArchived}
            />
            <hr className="border-slate-200" />
            <ArchiveButton classId={cls.id} isArchived={isArchived} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
