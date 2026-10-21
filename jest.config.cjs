module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.env.cjs', '<rootDir>/jest.setup.expo-fs.cjs'],
  // Reanimated setUpTests() needs the Jest env (Jest ≥28 → setupFilesAfterEnv).
  setupFilesAfterEnv: ['<rootDir>/jest.setup.reanimated.cjs'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  // jest-expo's list plus phosphor-react-native, whose per-icon modules
  // (src/components/ui/icons) ship as TypeScript source.
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|phosphor-react-native))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
  // `.cjs` is not in Jest's default testMatch; CI/workflow scripts under
  // .github must stay CommonJS because the root package.json is "type": "module".
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
    '**/?(*.)+(spec|test).cjs',
  ],
  moduleNameMapper: {
    '^expo-secure-store$': '<rootDir>/src/test/mocks/expo-secure-store.ts',
    '^expo-file-system$': '<rootDir>/src/test/mocks/expo-file-system.ts',
    '^expo-audio$': '<rootDir>/src/test/mocks/expo-audio.ts',
    '^expo-image$': '<rootDir>/src/test/mocks/expo-image.tsx',
  },
};
