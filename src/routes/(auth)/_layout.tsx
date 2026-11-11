import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { hideSplash } from '../../navigation/splashGate';

const styles = StyleSheet.create({ root: { flex: 1 } });

export default function AuthLayout() {
  return (
    // Signed out: the login form is the first screen, so its layout takes
    // the cold-start splash down.
    <View style={styles.root} onLayout={() => hideSplash('auth')}>
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}
