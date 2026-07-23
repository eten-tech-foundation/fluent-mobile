/**
 * jest-expo stubs `expo-file-system/legacy` in its preset setup. Re-bind to our
 * in-memory mock (#111) so id-based audio storage helpers can be unit-tested.
 *
 * Do not map `expo-file-system/legacy` in moduleNameMapper — that aliases the
 * mock file to the same module id and lets the stub replace named exports.
 */
const path = require('path');

jest.mock('expo-file-system/legacy', () =>
  jest.requireActual(
    path.join(__dirname, 'src/test/mocks/expo-file-system.ts'),
  ),
);
