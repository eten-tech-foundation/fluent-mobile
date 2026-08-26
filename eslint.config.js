import globals from 'globals';
import jestPlugin from 'eslint-plugin-jest';
import reactPlugin from 'eslint-plugin-react';
import typescriptParser from '@typescript-eslint/parser';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactNativePlugin from 'eslint-plugin-react-native';
import typescriptPlugin from '@typescript-eslint/eslint-plugin';

const handoffAntiPatternImports = {
  paths: [
    {
      name: '@env',
      message:
        'Use src/config/ (EXPO_PUBLIC_* via process.env). @env was removed in #70.',
    },
    {
      name: 'react-native-fs',
      message: 'Use expo-file-system.',
    },
    {
      name: 'react-native-keychain',
      message: 'Use expo-secure-store.',
    },
    {
      name: '@simform_solutions/react-native-audio-waveform',
      message: 'Use expo-audio.',
    },
  ],
  patterns: [
    {
      group: ['@react-navigation', '@react-navigation/*'],
      message:
        'Do not import @react-navigation/* in app code. Use expo-router or expo-router/drawer only (SDK 56+ Metro rejects direct imports).',
    },
  ],
};

const banDirectProcessEnv = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message:
    'Read env via src/config/ (typed + validated), not process.env directly.',
};

/** UI layers: screens, components, routes, hooks (#366). */
const uiLayerFiles = [
  'src/app/**/*.{js,jsx,ts,tsx}',
  'src/components/**/*.{js,jsx,ts,tsx}',
  'src/routes/**/*.{js,jsx,ts,tsx}',
  'src/hooks/**/*.{js,jsx,ts,tsx}',
];

const banUiFetch = {
  selector: "CallExpression[callee.name='fetch']",
  message:
    'UI layer must not call fetch() — use FluentAPI in src/services/api.ts plus sync.',
};

const banUiGlobalFetch = {
  // Catches globalThis.fetch / window.fetch; does not match NetInfo.fetch (different API).
  selector:
    "CallExpression[callee.type='MemberExpression'][callee.property.name='fetch'][callee.object.name=/^(globalThis|window|global)$/]",
  message:
    'UI layer must not call fetch() — use FluentAPI in src/services/api.ts plus sync.',
};

const banUiGetDatabase = {
  selector: "CallExpression[callee.name='getDatabase']",
  message:
    'UI layer must not call getDatabase() — use src/db/queries.ts (reads) and src/db/repository.ts (writes).',
};

const banUiExecuteSql = {
  selector:
    "CallExpression[callee.name='executeSql'], CallExpression[callee.type='MemberExpression'][callee.property.name='executeSql']",
  message:
    'UI layer must not call executeSql — use src/db/queries.ts / src/db/repository.ts.',
};

const uiLayerRestrictedImports = {
  paths: handoffAntiPatternImports.paths,
  patterns: [
    ...handoffAntiPatternImports.patterns,
    {
      group: ['**/db/db', '**/db/db.*'],
      message:
        'UI layer must not import the DB singleton — use src/db/queries.ts / src/db/repository.ts (prefer hooks).',
    },
  ],
};

export default [
  {
    ignores: [
      'node_modules',
      'dist',
      'build',
      'android',
      'ios',
      // Intentional violations — exercised by scripts/eslint-layer-boundaries.test.cjs
      'src/app/__fixtures__/eslint-layer-boundaries/**',
    ],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      globals: globals.browser,
      globals: globals.node,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-native': reactNativePlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      '@typescript-eslint': typescriptPlugin,
    },
    rules: {
      'react-native/no-inline-styles': 'warn',
      'react-native/no-unused-styles': 'warn',
      'react/self-closing-comp': 'warn',
      'react/jsx-curly-brace-presence': [
        'warn',
        { props: 'never', children: 'never' },
      ],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-imports': ['error', handoffAntiPatternImports],
      'no-restricted-syntax': ['error', banDirectProcessEnv],
      'prefer-const': 'warn',
      'no-var': 'warn',
      eqeqeq: 'warn',
    },
  },
  {
    files: uiLayerFiles,
    rules: {
      'no-restricted-imports': ['error', uiLayerRestrictedImports],
      'no-restricted-syntax': [
        'error',
        banDirectProcessEnv,
        banUiFetch,
        banUiGlobalFetch,
        banUiGetDatabase,
        banUiExecuteSql,
      ],
    },
  },
  {
    files: ['**/__tests__/**', '**/*.test.{js,jsx,ts,tsx}'],
    plugins: { jest: jestPlugin },
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
      },
    },
    rules: {
      'jest/no-disabled-tests': 'warn',
      'jest/no-focused-tests': 'error',
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['src/utils/logger.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['src/services/fluent-api.test.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['src/test/mocks/**'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^__' },
      ],
    },
  },
  {
    files: ['src/config/**/*.{ts,tsx}', 'app.config.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    // GitHub Actions / Node scripts — env secrets and console logging are intentional
    files: ['.github/scripts/**/*.{js,cjs,mjs}'],
    rules: {
      'no-console': 'off',
      'no-restricted-syntax': 'off',
    },
  },
];
