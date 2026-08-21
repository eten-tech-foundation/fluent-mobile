// Dev client native code exists only in the `development` EAS profile — not preview/production.
if (__DEV__) {
  require('expo-dev-client');
}
import 'react-native-gesture-handler';
import 'expo-router/entry';
