import React from 'react';
import { render, screen } from '@testing-library/react-native';
import ChaptersRoute from '../routes/(app)/(stack)/chapters';
import { UiVersionOverride } from '../theme/useTheme';

jest.mock('../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

jest.mock('../app/tabs/ViewProject', () => ({
  __esModule: true,
  default: () => {
    const { Text } = require('react-native');
    return <Text>Legacy chapters</Text>;
  },
}));

jest.mock('../app/v2/screens/BookScreen', () => ({
  __esModule: true,
  default: () => {
    const { Text } = require('react-native');
    return <Text>Next book page</Text>;
  },
}));

describe('chapters route', () => {
  it('shows the Legacy chapter list in Legacy', () => {
    render(
      <UiVersionOverride value="legacy">
        <ChaptersRoute />
      </UiVersionOverride>,
    );
    expect(screen.getByText('Legacy chapters')).toBeTruthy();
  });

  it('shows the book page in Next', () => {
    render(
      <UiVersionOverride value="next">
        <ChaptersRoute />
      </UiVersionOverride>,
    );
    expect(screen.getByText('Next book page')).toBeTruthy();
  });
});
