import type { ExpoConfig } from 'expo/config';

const EAS_PROJECT_ID = 'b0919574-f268-4768-b3bd-7cfa5172bbab';
const appVersion = process.env.APP_VERSION ?? '1.0.0';
const updateChannel = process.env.EAS_UPDATE_CHANNEL;

const config: ExpoConfig = {
  name: 'Fluent',
  slug: 'fluent-mobile',
  scheme: 'fluent',
  version: appVersion,
  icon: './assets/icon.png',
  updates: {
    url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
  },
  ...(updateChannel ? { channel: updateChannel } : {}),
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
          usesCleartextTraffic: true,
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
