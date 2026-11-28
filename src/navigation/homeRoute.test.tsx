import React from 'react';
import { render, screen } from '@testing-library/react-native';
import HomeRoute from '../routes/(app)/(stack)/index';
import { hrefs } from './hrefs';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ newUserLoading: 'true' }),
}));

jest.mock('../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
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
  it('shows Next Home', async () => {
    await render(<HomeRoute />);
    expect(screen.getByText('Next home true')).toBeTruthy();
  });

  it('keeps the home href on this route, including its launch parameter', () => {
    expect(hrefs.home({ newUserLoading: true })).toEqual({
      pathname: '/(app)/(stack)',
      params: { newUserLoading: 'true' },
    });
  });
});
