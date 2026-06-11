module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.env.cjs'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
};
