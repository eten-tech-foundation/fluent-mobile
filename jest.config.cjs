module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@react-navigation|react-native-safe-area-context|@react-native-vector-icons|react-native-screens|react-native-gesture-handler|react-native-svg|lucide-react-native)/)',
  ],
    testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
};
