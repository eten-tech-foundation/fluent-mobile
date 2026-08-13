const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
  // Required for react-native-worklets / Reanimated 4 on Expo.
  // Default inlineRequires:false breaks Worklets init (installUnpackers
  // reads __initData.code of undefined → redbox at startup).
  // See https://docs.swmansion.com/react-native-worklets/docs/guides/troubleshooting
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: true,
      inlineRequires: true,
    },
  }),
};

config.resolver = {
  ...config.resolver,
  assetExts: config.resolver.assetExts.filter(ext => ext !== 'svg'),
  sourceExts: [...config.resolver.sourceExts, 'svg'],
  blockList: [
    ...(Array.isArray(config.resolver.blockList)
      ? config.resolver.blockList
      : config.resolver.blockList
      ? [config.resolver.blockList]
      : []),
    /\/__tests__\//,
    /\.test\.[jt]sx?$/,
  ],
};

module.exports = config;
