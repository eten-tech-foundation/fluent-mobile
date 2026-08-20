import type { ExpoConfig } from 'expo/config';

const EAS_PROJECT_ID = 'b0919574-f268-4768-b3bd-7cfa5172bbab';

// Bumped by release/preview CI before EAS builds
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
// Expo Updates only for production. Preview / nightly / development ship
// self-contained APKs so concurrent QA builds are not overwritten by a shared channel.
const updatesEnabled = buildProfile === 'production';

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
    // EAS project env var `AQUIFER_API_KEY` (expo.dev → Environment variables).
    // Linked via eas.json `environment` per profile. Not EXPO_PUBLIC_ — baked into
    // extra at config resolve / EAS Build, then read via expo-constants.
    aquiferApiKey: process.env.AQUIFER_API_KEY?.trim() ?? '',
    aquiferApiBaseUrl: (
      process.env.EXPO_PUBLIC_AQUIFER_API_BASE_URL?.trim() ||
      'https://api.aquifer.bible'
    ).replace(/\/+$/, ''),
  },
  plugins: [
    [
      'expo-router',
      {
        // Keep existing `src/app/` screens/tabs; routes live in `src/routes/`.
        root: './src/routes',
      },
    ],
    // Edge-to-edge is mandatory on Android 16+ (already on via RN). Control
    // nav-bar button contrast via expo-navigation-bar — not deprecated
    // `androidNavigationBar` / opaque bar colors.
    [
      'expo-navigation-bar',
      {
        // Fully transparent bar so app chrome shows through (no contrast scrim).
        enforceContrast: false,
        // Dark icons for our light backgrounds (see plugin windowLightNavigationBar).
        style: 'dark',
      },
    ],
    'expo-status-bar',
    'expo-system-ui',
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
  experiments: {
    typedRoutes: true,
  },
};

export default config;
