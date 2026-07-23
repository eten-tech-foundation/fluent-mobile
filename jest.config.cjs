module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.env.cjs', '<rootDir>/jest.setup.expo-fs.cjs'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  moduleNameMapper: {
    '^expo-secure-store$': '<rootDir>/src/test/mocks/expo-secure-store.ts',
    '^expo-file-system$': '<rootDir>/src/test/mocks/expo-file-system.ts',
    '^expo-audio$': '<rootDir>/src/test/mocks/expo-audio.ts',
  },
};
