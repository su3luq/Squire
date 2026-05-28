import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AvatarSettings } from './avatar-settings';
import { PasswordSettings } from './password-settings';
import { EmailSettings } from './email-settings';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, avatar_url, current_rank')
    .eq('id', user.id)
    .single();
  if (!profile) redirect('/login');

  const isStudent = profile.role === 'student';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Manage your profile, password, and email."
      />

      {isStudent && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile picture</CardTitle>
          </CardHeader>
          <CardContent>
            <AvatarSettings
              fullName={profile.full_name}
              avatarUrl={profile.avatar_url}
              currentRank={profile.current_rank}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Password</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordSettings />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email</CardTitle>
        </CardHeader>
        <CardContent>
          <EmailSettings currentEmail={profile.email ?? user.email ?? ''} />
        </CardContent>
      </Card>
    </div>
  );
}
