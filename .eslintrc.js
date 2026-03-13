module.exports = {
  root: true,
  extends: ['@react-native'],
  plugins: ['react-native'],
  rules: {
    // React Native
    'react-native/no-inline-styles': 'error',
    'react-native/no-unused-styles': 'error',
    'react-native/no-raw-text': ['error', { skip: ['Text'] }],
    'react-native/no-color-literals': 'warn',
    'react-native/no-single-element-style-arrays': 'error',

    // TypeScript
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/no-non-null-assertion': 'warn',

    // React
    'react/self-closing-comp': 'error',
    'react/no-unused-state': 'warn',
    'react/jsx-no-duplicate-props': 'error',
    'react/jsx-curly-brace-presence': ['warn', { props: 'never', children: 'never' }],

    // React Hooks
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // Imports
    'no-duplicate-imports': 'error',

    // General
    'no-console': 'warn',
    'prefer-const': 'error',
    'no-var': 'error',
    eqeqeq: 'error',
    'no-shadow': 'error',
    curly: 'error',
  },
  overrides: [
    {
      files: ['**/__tests__/**', '**/*.test.*', 'jest.setup.js'],
      plugins: ['jest'],
      extends: ['plugin:jest/recommended'],
      env: { jest: true },
      rules: {
        'jest/no-disabled-tests': 'warn',
        'jest/no-focused-tests': 'error',
        'jest/no-identical-title': 'error',
        'jest/valid-expect': 'error',
        'jest/expect-expect': 'warn',
        'jest/no-standalone-expect': 'error',
      },
    },
  ],
};