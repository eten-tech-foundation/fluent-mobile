// Worklets/Reanimated are native; mock worklets first so imports don't hit JSI.
jest.mock('react-native-worklets', () =>
  require('react-native-worklets/lib/module/mock'),
);

require('react-native-reanimated').setUpTests();
