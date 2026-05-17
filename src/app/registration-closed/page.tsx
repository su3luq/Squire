import Link from 'next/link';

export default function RegistrationClosedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold">Registration is currently closed</h1>
        <p className="text-sm text-slate-600">
          Ask your teacher to enable registration so you can create your account.
        </p>
        <Link href="/login" className="inline-block text-sm font-semibold text-blue-600 hover:underline">
          Already have an account? Sign in
        </Link>
      </div>
    </main>
  );
}
