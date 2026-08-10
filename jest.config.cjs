module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.env.cjs', '<rootDir>/jest.setup.expo-fs.cjs'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
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
  },
};
