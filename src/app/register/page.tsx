'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { uploadAvatar } from '@/lib/avatar-upload';
import { registerStudentAction } from './actions';

type ClassOption = { id: string; name: string };
type RegistrationState = { classes: ClassOption[] };

export default function RegisterPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classId, setClassId] = useState('');
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc('get_registration_state').then(({ data, error }) => {
      if (error) {
        router.replace('/registration-closed');
        return;
      }
      const state = data as RegistrationState;
      if (state.classes.length === 0) {
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
    if (!fullName.trim()) return setError('Full name is required.');
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 1 || ageNum > 120) return setError('Please enter a valid age.');
    if (!email || !email.includes('@')) return setError('Please enter a valid email.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirmPassword) return setError('Passwords do not match.');

    startTransition(async () => {
      const result = await registerStudentAction({
        classId,
        fullName: fullName.trim(),
        age: ageNum,
        email: email.trim().toLowerCase(),
        password,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      // Best-effort avatar upload if one was selected. Registration
      // succeeded even if this step fails — the user can upload later
      // from /settings.
      if (avatarFile && result.userId) {
        try {
          await uploadAvatar(avatarFile);
        } catch (err) {
          console.warn('Avatar upload failed during registration', err);
        }
      }
      router.refresh();
    });
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(URL.createObjectURL(file));
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
              <Label htmlFor="fullName">
                Full name <span className="text-xs text-slate-500">(displayed to classmates)</span>
              </Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label>
                Profile picture <span className="text-xs text-slate-500">(optional)</span>
              </Label>
              <div className="flex items-center gap-4">
                <Avatar
                  url={avatarPreview}
                  name={fullName || 'You'}
                  size="lg"
                />
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={isPending}
                  >
                    {avatarFile ? 'Change photo' : 'Upload photo'}
                  </Button>
                  <p className="text-xs text-slate-500">
                    JPEG/PNG/WebP, resized to 256×256.
                  </p>
                </div>
              </div>
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
                  autoCapitalize="off"
                  autoCorrect="off"
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
