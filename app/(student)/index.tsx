import { View, Text, Pressable } from 'react-native';
import { signOut } from '../../lib/auth';
import { useAuth } from '../../lib/auth-context';

export default function StudentHome() {
  const { profile } = useAuth();
  return (
    <View className="flex-1 items-center justify-center bg-white p-6">
      <Text className="text-2xl font-bold text-slate-900">Student Home</Text>
      <Text className="mt-2 text-sm text-slate-600">Welcome, {profile?.display_name}.</Text>
      <Text className="mt-1 text-xs text-slate-500">Username: {profile?.username}</Text>
      <Pressable
        className="mt-6 rounded-md bg-slate-900 px-4 py-2"
        onPress={() => signOut()}>
        <Text className="text-white">Sign out</Text>
      </Pressable>
    </View>
  );
}
