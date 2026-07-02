describe('demoMode config', () => {
  const originalDemoMode = process.env.EXPO_PUBLIC_DEMO_MODE;

  afterEach(() => {
    if (originalDemoMode === undefined) {
      delete process.env.EXPO_PUBLIC_DEMO_MODE;
    } else {
      process.env.EXPO_PUBLIC_DEMO_MODE = originalDemoMode;
    }
    jest.resetModules();
  });

  it('is false when env is unset', () => {
    delete process.env.EXPO_PUBLIC_DEMO_MODE;
    jest.isolateModules(() => {
      const { IS_DEMO_MODE } = require('./demoMode');
      expect(IS_DEMO_MODE).toBe(false);
    });
  });

  it('is true when env is "true"', () => {
    process.env.EXPO_PUBLIC_DEMO_MODE = 'true';
    jest.isolateModules(() => {
      const { IS_DEMO_MODE } = require('./demoMode');
      expect(IS_DEMO_MODE).toBe(true);
    });
  });
});
