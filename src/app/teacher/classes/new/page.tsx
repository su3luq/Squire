import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { NewClassForm } from './new-class-form';

export default function NewClassPage() {
  return (
    <main className="container mx-auto max-w-xl p-6">
      <Link
        href="/teacher/classes"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Classes
      </Link>
      <h1 className="mb-6 text-3xl font-bold">New class</h1>

      <Card>
        <CardContent className="pt-6">
          <NewClassForm />
        </CardContent>
      </Card>
    </main>
  );
}
