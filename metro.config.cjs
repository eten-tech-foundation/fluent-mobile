const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
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
