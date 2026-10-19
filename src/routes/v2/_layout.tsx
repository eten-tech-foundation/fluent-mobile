import { Stack } from 'expo-router';

/** v2 route tree, registered only while the UI version is Next. */
export default function V2StackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
