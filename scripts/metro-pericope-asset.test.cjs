'use strict';

describe('metro pericope assets', () => {
  it('keeps .pericope files out of the JS bundle', () => {
    jest.resetModules();
    jest.doMock(
      'expo/metro-config',
      () => ({
        getDefaultConfig: () => ({
          transformer: {},
          resolver: {
            assetExts: ['png', 'json'],
            sourceExts: ['js', 'json', 'ts'],
            blockList: [],
          },
        }),
      }),
      { virtual: true },
    );

    const config = require('../metro.config.cjs');

    expect(config.resolver.assetExts).toContain('pericope');
    expect(config.resolver.sourceExts).not.toContain('pericope');
  });
});
