import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { KeyDeck } from './KeyDeck';
import { setUiVersion } from '../../services/userPreferences';
import { legacyTheme } from '../../theme';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

describe('KeyDeck', () => {
  beforeEach(() => {
    mockPreferenceStore();
  });

  it('frames its keys in surface/inverse with 2pt seams', () => {
    render(
      <KeyDeck testID="deck">
        <Text>Play</Text>
      </KeyDeck>,
    );

    expect(
      StyleSheet.flatten(screen.getByTestId('deck').props.style),
    ).toMatchObject({
      backgroundColor: legacyTheme.roles.surfaceInverse,
      padding: 2,
      gap: 2,
    });
    expect(screen.getByText('Play')).toBeTruthy();
  });

  it('uses the Next Hardware deck color in Next', () => {
    render(
      <KeyDeck testID="deck">
        <Text>Play</Text>
      </KeyDeck>,
    );

    act(() => {
      setUiVersion('next');
    });

    expect(
      StyleSheet.flatten(screen.getByTestId('deck').props.style)
        .backgroundColor,
    ).toBe('#2C2B29');
  });
});
