import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { KeyDeck } from './KeyDeck';
import { setUiVersion } from '../../services/userPreferences';
import { legacyTheme, resolveTheme } from '../../theme';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';
import { UiVersionPreferenceProvider } from '../../theme/UiVersionPreferenceProvider';

jest.mock('../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

const renderWithPreferences = (ui: React.ReactElement) =>
  render(ui, { wrapper: UiVersionPreferenceProvider });

describe('KeyDeck', () => {
  beforeEach(() => {
    mockPreferenceStore();
  });

  it('frames its keys in surface/inverse with 2pt seams', () => {
    renderWithPreferences(
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

  it('follows independently scoped Next deck color and returns to Legacy', () => {
    const roles = resolveTheme('next').roles as { surfaceInverse: string };
    const original = roles.surfaceInverse;
    try {
      roles.surfaceInverse = '#123456';
      renderWithPreferences(
        <KeyDeck testID="deck">
          <Text>Play</Text>
        </KeyDeck>,
      );
      const background = () =>
        StyleSheet.flatten(screen.getByTestId('deck').props.style)
          .backgroundColor;
      expect(background()).toBe(legacyTheme.roles.surfaceInverse);
      act(() => setUiVersion('next'));
      expect(background()).toBe('#123456');
      act(() => setUiVersion('legacy'));
      expect(background()).toBe(legacyTheme.roles.surfaceInverse);
    } finally {
      roles.surfaceInverse = original;
    }
  });
});
