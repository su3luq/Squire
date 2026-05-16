import { Stack } from 'expo-router';
import 'react-native-url-polyfill/auto';
import '../global.css';

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
