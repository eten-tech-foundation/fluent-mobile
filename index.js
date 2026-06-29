// Dev client native code exists only in the `development` EAS profile — not preview/production.
if (__DEV__) {
  require('expo-dev-client');
}
import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
