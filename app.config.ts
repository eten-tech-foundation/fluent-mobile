import type { ExpoConfig } from 'expo/config';

const EAS_PROJECT_ID = 'b0919574-f268-4768-b3bd-7cfa5172bbab';

// Bumped by release/preview CI before EAS builds; OTA may set APP_VERSION on the runner
const APP_VERSION_FALLBACK = '1.0.0';

function resolveAppVersion(): string {
  const fromEnv = process.env.APP_VERSION;
  if (fromEnv && !fromEnv.startsWith('$')) {
    return fromEnv;
  }
  return APP_VERSION_FALLBACK;
}

const appVersion = resolveAppVersion();

const buildProfile = process.env.EAS_BUILD_PROFILE;
const usesCleartextTraffic = buildProfile !== 'production';
// OTA updates apply to EAS preview/production only. Local, development, and
// nightly builds keep updates disabled (nightly ships a self-contained APK).
// Checking u.expo.dev on launch crashes when no bundle exists.
const updatesEnabled =
  buildProfile === 'preview' || buildProfile === 'production';

const config: ExpoConfig = {
  name: 'Fluent',
  slug: 'fluent-mobile',
  scheme: 'fluent',
  version: appVersion,
  icon: './assets/icon.png',
  // Root / window background after splash — white app chrome (not brand blue).
  // BootSplash cold-start still uses assets/bootsplash (blue).
  backgroundColor: '#FFFFFF',
  userInterfaceStyle: 'light',
  updates: {
    url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    enabled: updatesEnabled,
    ...(buildProfile === 'preview'
      ? { requestHeaders: { 'expo-channel-name': 'preview' } }
      : {}),
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  android: {
    package: 'com.eten.fluent',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0B50D0',
    },
  },
  extra: {
    eas: {
      projectId: EAS_PROJECT_ID,
    },
  },
  plugins: [
    [
      'expo-build-properties',
      {
        android: {
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          minSdkVersion: 24,
          buildToolsVersion: '36.0.0',
          kotlinVersion: '2.1.20',
          usesCleartextTraffic,
          newArchEnabled: true,
        },
      },
    ],
    [
      'react-native-bootsplash',
      {
        assetsDir: 'assets/bootsplash',
      },
    ],
    // After bootsplash → AppTheme, keep window white (avoids Metro blue flash).
    './plugins/withAppWindowBackground',
    './plugins/withRNScreensFragmentFactory',
    'expo-secure-store',
    'expo-asset',
    [
      'expo-audio',
      {
        // Android RECORD_AUDIO via config plugin (recordAudioAndroid defaults true).
        // No microphonePermission — that string is iOS-only and this app is Android-only.
        recordAudioAndroid: true,
        enableBackgroundRecording: false,
      },
    ],
  ],
};

export default config;
