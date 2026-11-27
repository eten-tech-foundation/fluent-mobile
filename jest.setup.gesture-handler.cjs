// Gesture Handler 3's `GestureDetector` throws in dev unless a
// `GestureHandlerRootView` is an ancestor. The app has one at the root; unit
// tests render single screens, so they get the same "inside a root view" state
// by default. The package ships `lib/module` as `main` and `src` for Metro, so
// both paths are mocked, like the package's own `jestSetup`, which also stubs
// the native module.
require('react-native-gesture-handler/jestSetup');
const rootViewContext = () => {
  const React = require('react');
  return { __esModule: true, default: React.createContext(true) };
};
jest.mock(
  'react-native-gesture-handler/lib/module/GestureHandlerRootViewContext',
  rootViewContext,
);
jest.mock(
  'react-native-gesture-handler/src/GestureHandlerRootViewContext',
  rootViewContext,
);
