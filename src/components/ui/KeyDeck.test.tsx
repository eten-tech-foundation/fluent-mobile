import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { KeyDeck } from './KeyDeck';
import { legacyTheme, resolveTheme } from '../../theme';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';
import { UiVersionPreferenceProvider } from '../../theme/UiVersionPreferenceProvider';
import { UiVersionOverride } from '../../theme/useTheme';

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

  it('frames its keys in surface/inverse with 2pt seams', async () => {
    await renderWithPreferences(
      <UiVersionOverride value="legacy">
        <KeyDeck testID="deck">
          <Text>Play</Text>
        </KeyDeck>
      </UiVersionOverride>,
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

  it('follows independently scoped Next deck color and returns to Legacy', async () => {
    const roles = resolveTheme('next').roles as { surfaceInverse: string };
    const original = roles.surfaceInverse;
    try {
      roles.surfaceInverse = '#123456';
      const deck = (
        <KeyDeck testID="deck">
          <Text>Play</Text>
        </KeyDeck>
      );
      const { rerender } = await renderWithPreferences(
        <UiVersionOverride value="legacy">{deck}</UiVersionOverride>,
      );
      const background = () =>
        StyleSheet.flatten(screen.getByTestId('deck').props.style)
          .backgroundColor;
      expect(background()).toBe(legacyTheme.roles.surfaceInverse);
      await rerender(
        <UiVersionOverride value="next">{deck}</UiVersionOverride>,
      );
      expect(background()).toBe('#123456');
      await rerender(
        <UiVersionOverride value="legacy">{deck}</UiVersionOverride>,
      );
      expect(background()).toBe(legacyTheme.roles.surfaceInverse);
    } finally {
      roles.surfaceInverse = original;
    }
  });
});
