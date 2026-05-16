import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { lookupClass, checkUsernameAvailable, registerStudent } from '../../lib/auth';

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export default function Register() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 — class code
  const [inviteCode, setInviteCode] = useState('');
  const [classInfo, setClassInfo] = useState<{ id: string; name: string } | null>(null);
  const [step1Loading, setStep1Loading] = useState(false);
  const [step1Error, setStep1Error] = useState<string | null>(null);

  // Step 2 — profile fields
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [usernameMessage, setUsernameMessage] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step2Errors, setStep2Errors] = useState<Record<string, string>>({});

  // Step 3 — submission
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Debounced username availability check (400ms after last keystroke).
  useEffect(() => {
    if (!username.trim()) {
      setUsernameStatus('idle');
      setUsernameMessage(null);
      return;
    }
    setUsernameStatus('checking');
    setUsernameMessage(null);
    const handle = setTimeout(async () => {
      const result = await checkUsernameAvailable(username);
      if (result.ok) {
        setUsernameStatus('available');
        setUsernameMessage(null);
      } else {
        setUsernameStatus(result.reason === 'Username is already taken.' ? 'taken' : 'invalid');
        setUsernameMessage(result.reason);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [username]);

  async function handleStep1Submit() {
    const code = inviteCode.trim().toUpperCase();
    if (!code) {
      setStep1Error('Please enter an invite code.');
      return;
    }
    setStep1Loading(true);
    setStep1Error(null);
    const result = await lookupClass(code);
    setStep1Loading(false);
    if (!result) {
      setStep1Error('Invite code not valid.');
      return;
    }
    setClassInfo(result);
    setStep(2);
  }

  function handleStep2Submit() {
    const errors: Record<string, string> = {};
    if (!username.trim()) {
      errors.username = 'Username is required.';
    } else if (usernameStatus !== 'available') {
      errors.username = usernameMessage ?? 'Choose an available username.';
    }
    if (!displayName.trim()) errors.displayName = 'Display name is required.';
    if (!fullName.trim()) errors.fullName = 'Full name is required.';
    const ageNum = parseInt(age, 10);
    if (!age.trim()) {
      errors.age = 'Age is required.';
    } else if (Number.isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
      errors.age = 'Enter a valid age.';
    }
    if (password.length < 6) errors.password = 'Password must be at least 6 characters.';
    if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';

    setStep2Errors(errors);
    if (Object.keys(errors).length === 0) setStep(3);
  }

  async function handleStep3Submit() {
    if (!classInfo) return;
    setSubmitLoading(true);
    setSubmitError(null);
    const { error } = await registerStudent({
      username: username.trim(),
      password,
      displayName: displayName.trim(),
      fullName: fullName.trim(),
      age: parseInt(age, 10),
      classId: classInfo.id,
      email: email.trim() || undefined,
    });
    if (error) {
      setSubmitError(error.message);
      setSubmitLoading(false);
    }
    // Success: RouteGuard takes over once the session lands.
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="p-6">
            {step === 1 && (
              <View>
                <Text className="text-3xl font-bold text-slate-900">Join your class</Text>
                <Text className="mt-2 text-base text-slate-600">
                  Enter the invite code your teacher provided.
                </Text>

                <View className="mt-8 gap-2">
                  <Text className="text-sm font-medium text-slate-700">Invite code</Text>
                  <TextInput
                    value={inviteCode}
                    onChangeText={setInviteCode}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={10}
                    placeholder="ABC123"
                    placeholderTextColor="#94a3b8"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
                  />
                </View>

                <Pressable
                  onPress={handleStep1Submit}
                  disabled={step1Loading}
                  className={`mt-6 rounded-md bg-blue-600 px-4 py-3 ${step1Loading ? 'opacity-50' : ''}`}
                >
                  <Text className="text-center text-base font-semibold text-white">
                    {step1Loading ? 'Looking up...' : 'Continue'}
                  </Text>
                </Pressable>

                {step1Error && (
                  <Text className="mt-3 text-sm text-red-600">{step1Error}</Text>
                )}

                <Pressable onPress={() => router.replace('/(auth)/login')} className="mt-6">
                  <Text className="text-center text-sm text-slate-600">
                    Already have an account?{' '}
                    <Text className="font-semibold text-blue-600">Sign in</Text>
                  </Text>
                </Pressable>
              </View>
            )}

            {step === 2 && classInfo && (
              <View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-base text-slate-700">
                    Joining: <Text className="font-semibold text-slate-900">{classInfo.name}</Text>
                  </Text>
                  <Pressable
                    onPress={() => {
                      setClassInfo(null);
                      setStep(1);
                    }}
                  >
                    <Text className="text-sm font-medium text-blue-600">Change</Text>
                  </Pressable>
                </View>

                <Text className="mt-4 text-xs text-slate-500">
                  You can add interests and a profile picture later.
                </Text>

                <View className="mt-6 gap-4">
                  <View className="gap-2">
                    <Text className="text-sm font-medium text-slate-700">Username</Text>
                    <TextInput
                      value={username}
                      onChangeText={setUsername}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="username-new"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
                    />
                    {usernameStatus === 'checking' && (
                      <Text className="text-xs text-slate-500">Checking availability...</Text>
                    )}
                    {usernameStatus === 'available' && (
                      <Text className="text-xs text-green-600">Username available.</Text>
                    )}
                    {(usernameStatus === 'taken' || usernameStatus === 'invalid') &&
                      usernameMessage && (
                        <Text className="text-xs text-red-600">{usernameMessage}</Text>
                      )}
                    {step2Errors.username &&
                      usernameStatus !== 'taken' &&
                      usernameStatus !== 'invalid' && (
                        <Text className="text-xs text-red-600">{step2Errors.username}</Text>
                      )}
                  </View>

                  <View className="gap-2">
                    <Text className="text-sm font-medium text-slate-700">Display name</Text>
                    <Text className="text-xs text-slate-500">What classmates see.</Text>
                    <TextInput
                      value={displayName}
                      onChangeText={setDisplayName}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
                    />
                    {step2Errors.displayName && (
                      <Text className="text-xs text-red-600">{step2Errors.displayName}</Text>
                    )}
                  </View>

                  <View className="gap-2">
                    <Text className="text-sm font-medium text-slate-700">Full name</Text>
                    <Text className="text-xs text-slate-500">Only your teacher sees this.</Text>
                    <TextInput
                      value={fullName}
                      onChangeText={setFullName}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
                    />
                    {step2Errors.fullName && (
                      <Text className="text-xs text-red-600">{step2Errors.fullName}</Text>
                    )}
                  </View>

                  <View className="gap-2">
                    <Text className="text-sm font-medium text-slate-700">Age</Text>
                    <TextInput
                      value={age}
                      onChangeText={setAge}
                      keyboardType="number-pad"
                      maxLength={3}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
                    />
                    {step2Errors.age && (
                      <Text className="text-xs text-red-600">{step2Errors.age}</Text>
                    )}
                  </View>

                  <View className="gap-2">
                    <Text className="text-sm font-medium text-slate-700">Email (optional)</Text>
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
                    />
                  </View>

                  <View className="gap-2">
                    <Text className="text-sm font-medium text-slate-700">Password</Text>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry
                      autoComplete="new-password"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
                    />
                    {step2Errors.password && (
                      <Text className="text-xs text-red-600">{step2Errors.password}</Text>
                    )}
                  </View>

                  <View className="gap-2">
                    <Text className="text-sm font-medium text-slate-700">Confirm password</Text>
                    <TextInput
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry
                      autoComplete="new-password"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
                    />
                    {step2Errors.confirmPassword && (
                      <Text className="text-xs text-red-600">{step2Errors.confirmPassword}</Text>
                    )}
                  </View>
                </View>

                <View className="mt-6 flex-row gap-3">
                  <Pressable
                    onPress={() => setStep(1)}
                    className="flex-1 rounded-md border border-slate-300 bg-white px-4 py-3"
                  >
                    <Text className="text-center text-base font-semibold text-slate-700">Back</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleStep2Submit}
                    className="flex-1 rounded-md bg-blue-600 px-4 py-3"
                  >
                    <Text className="text-center text-base font-semibold text-white">Continue</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {step === 3 && classInfo && (
              <View>
                <Text className="text-3xl font-bold text-slate-900">Confirm your details</Text>
                <Text className="mt-2 text-base text-slate-600">
                  Review before creating your account.
                </Text>

                <View className="mt-6 gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
                  <SummaryRow label="Class" value={classInfo.name} />
                  <SummaryRow label="Username" value={username.toLowerCase().trim()} />
                  <SummaryRow label="Display name" value={displayName.trim()} />
                  <SummaryRow label="Full name" value={fullName.trim()} />
                  <SummaryRow label="Age" value={age} />
                  {email.trim() !== '' && <SummaryRow label="Email" value={email.trim()} />}
                  <SummaryRow label="Password" value="Password set ✓" />
                </View>

                <View className="mt-6 flex-row gap-3">
                  <Pressable
                    onPress={() => setStep(2)}
                    disabled={submitLoading}
                    className={`flex-1 rounded-md border border-slate-300 bg-white px-4 py-3 ${submitLoading ? 'opacity-50' : ''}`}
                  >
                    <Text className="text-center text-base font-semibold text-slate-700">Back</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleStep3Submit}
                    disabled={submitLoading}
                    className={`flex-1 rounded-md bg-blue-600 px-4 py-3 ${submitLoading ? 'opacity-50' : ''}`}
                  >
                    <Text className="text-center text-base font-semibold text-white">
                      {submitLoading ? 'Creating...' : 'Create account'}
                    </Text>
                  </Pressable>
                </View>

                {submitError && (
                  <Text className="mt-3 text-sm text-red-600">{submitError}</Text>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="text-sm text-slate-600">{label}</Text>
      <Text className="text-sm font-medium text-slate-900">{value}</Text>
    </View>
  );
}
