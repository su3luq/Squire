import Link from 'next/link';
import { Layers, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { cn } from '@/lib/utils';

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
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Classes"
        subtitle="Open a class to let new students register into it. Archive classes you've finished teaching to keep them out of student-facing lists."
        actions={
          <Link
            href="/teacher/classes/new"
            className={buttonVariants({ size: 'sm' })}
          >
            <Plus className="h-4 w-4" />
            New class
          </Link>
        }
      />

      {!classes || classes.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No classes yet"
          description="Create your first class to start enrolling students."
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {classes.map((c) => {
            const count = studentCountByClass.get(c.id) ?? 0;
            const archived = c.archived_at !== null;
            return (
              <li key={c.id} className={cn(archived && 'opacity-60')}>
                <Link
                  href={`/teacher/classes/${c.id}`}
                  className="block p-5 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {count} {count === 1 ? 'student' : 'students'}
                      </p>
                    </div>
                    {archived ? (
                      <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        Archived
                      </span>
                    ) : c.registration_open ? (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                        Registration open
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        Registration closed
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
