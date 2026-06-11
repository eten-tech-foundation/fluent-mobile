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

const usesCleartextTraffic = process.env.EAS_BUILD_PROFILE !== 'production';

const config: ExpoConfig = {
  name: 'Fluent',
  slug: 'fluent-mobile',
  scheme: 'fluent',
  version: appVersion,
  icon: './assets/icon.png',
  updates: {
    url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
  },
  runtimeVersion: appVersion,
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
    './plugins/withRNScreensFragmentFactory',
  ],
};

export default config;
