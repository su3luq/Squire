import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function ClassesListPage() {
  const supabase = await createClient();

  const { data: classes } = await supabase
    .from('classes')
    .select('id, name, registration_open, archived_at, created_at')
    .order('archived_at', { ascending: true, nullsFirst: true })
    .order('name');

  const classIds = (classes ?? []).map((c) => c.id);
  const studentCountByClass = new Map<string, number>();
  if (classIds.length > 0) {
    const { data: rows } = await supabase
      .from('profiles')
      .select('class_id')
      .eq('role', 'student')
      .in('class_id', classIds);
    for (const r of rows ?? []) {
      if (r.class_id)
        studentCountByClass.set(
          r.class_id,
          (studentCountByClass.get(r.class_id) ?? 0) + 1
        );
    }
  }

  return (
    <main className="container mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link
            href="/teacher"
            className="mb-2 inline-block text-sm text-blue-600 hover:underline"
          >
            ← Dashboard
          </Link>
          <h1 className="text-3xl font-bold">Classes</h1>
        </div>
        <Link href="/teacher/classes/new" className={buttonVariants()}>
          New class
        </Link>
      </div>

      <p className="mb-6 text-xs text-slate-500">
        Open a class to let new students register into it. Archive classes
        you&apos;ve finished teaching to keep them out of student-facing lists.
      </p>

      {!classes || classes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-slate-600">No classes yet.</p>
            <p className="mt-2 text-sm text-slate-500">
              Create your first class to start enrolling students.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {classes.map((c) => {
            const count = studentCountByClass.get(c.id) ?? 0;
            const archived = c.archived_at !== null;
            return (
              <Link key={c.id} href={`/teacher/classes/${c.id}`}>
                <Card
                  className={`transition-colors hover:bg-slate-50 ${archived ? 'opacity-60' : ''}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="truncate">{c.name}</CardTitle>
                        <CardDescription className="pt-1 text-xs">
                          {count} {count === 1 ? 'student' : 'students'}
                        </CardDescription>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {archived ? (
                          <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                            Archived
                          </span>
                        ) : c.registration_open ? (
                          <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                            Registration open
                          </span>
                        ) : (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            Registration closed
                          </span>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
