import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import 'react-native-url-polyfill/auto';
import '../global.css';
import { AuthProvider, useAuth } from '../lib/auth-context';

function RouteGuard() {
  const { session, profile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inStudentGroup = segments[0] === '(student)';
    const inTeacherGroup = segments[0] === '(teacher)';

    // Not signed in: only auth routes allowed.
    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }

    // Signed in but profile not loaded yet (or row missing): stay in auth flow to recover.
    if (!profile) {
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }

    // Signed in with profile: route by role.
    if (profile.role === 'teacher' && !inTeacherGroup) {
      router.replace('/(teacher)');
    } else if (profile.role === 'student' && !inStudentGroup) {
      router.replace('/(student)');
    }
  }, [session, profile, loading, segments]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RouteGuard />
    </AuthProvider>
  );
}
