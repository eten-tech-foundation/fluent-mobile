import React from 'react';
import { render, screen } from '@testing-library/react-native';
import HomeRoute from '../routes/(app)/(stack)/index';
import { hrefs } from './hrefs';
import { mockPreferenceStore } from '../test/mocks/preferenceStore';
import { UiVersionPreferenceProvider } from '../theme/UiVersionPreferenceProvider';
import { UiVersionOverride } from '../theme/useTheme';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ newUserLoading: 'true' }),
}));

jest.mock('../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

jest.mock('../app/screens/HomeScreen', () => ({
  __esModule: true,
  default: () => {
    const { Text } = require('react-native');
    return <Text>Legacy home</Text>;
  },
}));

jest.mock('../app/v2/screens/HomeScreen', () => ({
  __esModule: true,
  default: function NextHomeRouteScreen() {
    const { Text } = require('react-native');
    const { useLocalSearchParams } = require('expo-router');
    const params = useLocalSearchParams();
    return <Text>{`Next home ${params.newUserLoading}`}</Text>;
  },
}));

describe('home route', () => {
  it('shows Next Home when a subtree is pinned to Legacy', async () => {
    await render(
      <UiVersionOverride value="legacy">
        <HomeRoute />
      </UiVersionOverride>,
    );
    expect(screen.getByText('Next home true')).toBeTruthy();
    expect(screen.queryByText('Legacy home')).toBeNull();
  });

  it('shows Next Home on the first paint when storage says Legacy', async () => {
    mockPreferenceStore({ pref_ui_version: 'legacy' });
    await render(
      <UiVersionPreferenceProvider>
        <HomeRoute />
      </UiVersionPreferenceProvider>,
    );
    expect(screen.getByText('Next home true')).toBeTruthy();
    expect(screen.queryByText('Legacy home')).toBeNull();
  });

  it('keeps the home href on this route, including its launch parameter', () => {
    expect(hrefs.home({ newUserLoading: true })).toEqual({
      pathname: '/(app)/(stack)',
      params: { newUserLoading: 'true' },
    });
  });
});
