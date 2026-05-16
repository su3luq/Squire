import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { signInWithUsername } from '../../lib/auth';

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const { error: authError } = await signInWithUsername(username.trim().toLowerCase(), password);
    if (authError) {
      setError(authError.message);
      setSubmitting(false);
      return;
    }
    // Success — AuthProvider's onAuthStateChange will fire; RouteGuard navigates from there.
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View className="flex-1 justify-center px-6">
          <Text className="text-3xl font-bold text-slate-900">Welcome to Squire</Text>
          <Text className="mt-2 text-base text-slate-600">
            Sign in with your username and password.
          </Text>

          <View className="mt-8 gap-4">
            <View className="gap-2">
              <Text className="text-sm font-medium text-slate-700">Username</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
              />
            </View>

            <View className="gap-2">
              <Text className="text-sm font-medium text-slate-700">Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
              />
            </View>
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            className={`mt-6 rounded-md bg-blue-600 px-4 py-3 ${!canSubmit ? 'opacity-50' : ''}`}
          >
            <Text className="text-center text-base font-semibold text-white">
              {submitting ? 'Signing in...' : 'Sign in'}
            </Text>
          </Pressable>

          {error && <Text className="mt-3 text-sm text-red-600">{error}</Text>}

          <Pressable onPress={() => router.push('/(auth)/register')} className="mt-6">
            <Text className="text-center text-sm text-slate-600">
              Don't have an account?{' '}
              <Text className="font-semibold text-blue-600">Register</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
