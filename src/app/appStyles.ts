import { StyleSheet } from 'react-native';

export const appStyles = StyleSheet.create({
  menuDivider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 4 },
  menuSectionLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingVertical: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuItemDanger: { color: '#d32f2f' },
  // Root layout — keep white (not brand blue). Metro remount resets loading, so a
  // blue init root flashes over white chrome; cold-start bootsplash stays blue.
  appRoot: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  containerAppInit: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  errorTextAppInit: {
    color: 'red',
    fontSize: 14,
    padding: 20,
    textAlign: 'center',
  },
  loadingTextAppInit: { marginTop: 10, fontSize: 14, color: '#1A1A1A' },
});
