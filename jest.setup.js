module.exports = {
  root: true,
  extends: ['@react-native'],
  plugins: ['react-native'],
  rules: {
    // ... your rules
  },
  overrides: [
    {
      files: ['**/__tests__/**', '**/*.test.*', 'jest.setup.js'],
      env: {
        jest: true,
      },
    },
  ],
};
