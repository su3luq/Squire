'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { registerStudentAction } from './actions';

type ClassOption = { id: string; name: string };
type RegistrationState = { open: boolean; classes: ClassOption[] };

export default function RegisterPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classId, setClassId] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Load registration state on mount. The gated RPC returns {open, classes} atomically.
  // If registration is closed or no classes available → redirect to /registration-closed.
  useEffect(() => {
    const supabase = createClient();
    supabase.rpc('get_registration_state').then(({ data, error }) => {
      if (error) {
        router.replace('/registration-closed');
        return;
      }
      const state = data as RegistrationState;
      if (!state.open || state.classes.length === 0) {
        router.replace('/registration-closed');
        return;
      }
      setClasses(state.classes);
      setClassesLoading(false);
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!classId) return setError('Please select a class.');
    if (!username) return setError('Username is required.');
    if (username.length < 3) return setError('Username must be at least 3 characters.');
    if (!/^[a-z][a-z0-9_]*$/i.test(username)) {
      return setError('Username must start with a letter and contain only letters, numbers, and underscores.');
    }
    if (!displayName.trim()) return setError('Display name is required.');
    if (!fullName.trim()) return setError('Full name is required.');
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 1 || ageNum > 120) return setError('Please enter a valid age.');
    if (!email || !email.includes('@')) return setError('Please enter a valid email.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirmPassword) return setError('Passwords do not match.');

    startTransition(async () => {
      const result = await registerStudentAction({
        classId,
        username: username.toLowerCase(),
        displayName: displayName.trim(),
        fullName: fullName.trim(),
        age: ageNum,
        email: email.trim(),
        password,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-sm text-slate-600">Join your class and start your journey.</p>
        </div>

        {classesLoading ? (
          <p className="text-center text-sm text-slate-600">Loading classes...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="class">Class</Label>
              <select
                id="class"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                disabled={isPending}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select your class...</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">
                Display name <span className="text-xs text-slate-500">(what classmates see)</span>
              </Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">
                Full name <span className="text-xs text-slate-500">(only your teacher sees this)</span>
              </Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  inputMode="numeric"
                  maxLength={3}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isPending}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Creating account...' : 'Create account'}
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
