import React from 'react';
import { render, screen } from '@testing-library/react-native';
import HomeRoute from '../routes/(app)/(stack)/index';
import { UiVersionOverride } from '../theme/useTheme';

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
  default: () => {
    const { Text } = require('react-native');
    return <Text>Next home</Text>;
  },
}));

describe('home route', () => {
  it('shows Legacy Home in Legacy', () => {
    render(
      <UiVersionOverride value="legacy">
        <HomeRoute />
      </UiVersionOverride>,
    );
    expect(screen.getByText('Legacy home')).toBeTruthy();
  });

  it('shows Next Home in Next', () => {
    render(
      <UiVersionOverride value="next">
        <HomeRoute />
      </UiVersionOverride>,
    );
    expect(screen.getByText('Next home')).toBeTruthy();
  });
});
