import React from 'react';
import { render, screen } from '@testing-library/react-native';
import ObserverDraftRoute from '../routes/(app)/(stack)/observer-draft';
import { UiVersionOverride } from '../theme/useTheme';

jest.mock('../app/screens/ObserverDraftScreen', () => ({
  __esModule: true,
  default: () => {
    const { Text } = require('react-native');
    return <Text>Legacy observer</Text>;
  },
}));

jest.mock('../app/v2/screens/ObserverScreen', () => ({
  __esModule: true,
  default: () => {
    const { Text } = require('react-native');
    return <Text>Next observer</Text>;
  },
}));

describe('observer-draft route', () => {
  it('shows the Legacy Observer screen in Legacy', async () => {
    await render(
      <UiVersionOverride value="legacy">
        <ObserverDraftRoute />
      </UiVersionOverride>,
    );
    expect(screen.getByText('Legacy observer')).toBeTruthy();
  });

  it('shows the Next Observer screen in Next', async () => {
    await render(
      <UiVersionOverride value="next">
        <ObserverDraftRoute />
      </UiVersionOverride>,
    );
    expect(screen.getByText('Next observer')).toBeTruthy();
    expect(screen.queryByText('Legacy observer')).toBeNull();
  });
});
