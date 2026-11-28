import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { KeyDeck } from './KeyDeck';
import { resolveTheme } from '../../theme';
import { ColorModeScope } from '../../theme/useTheme';

jest.mock('../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

describe('KeyDeck', () => {
  it('frames its keys in surface/inverse with 2pt seams', async () => {
    await render(
      <KeyDeck testID="deck">
        <Text>Play</Text>
      </KeyDeck>,
    );

    expect(
      StyleSheet.flatten(screen.getByTestId('deck').props.style),
    ).toMatchObject({
      backgroundColor: resolveTheme().roles.surfaceInverse,
      padding: 2,
      gap: 2,
    });
    expect(screen.getByText('Play')).toBeTruthy();
  });

  it('follows a color mode and returns to Hardware', async () => {
    const hardware = resolveTheme('hardware').roles.surfaceInverse;
    const canvas = resolveTheme('canvas').roles.surfaceInverse;
    expect(hardware).not.toBe(canvas);
    const deck = (
      <KeyDeck testID="deck">
        <Text>Play</Text>
      </KeyDeck>
    );
    const { rerender } = await render(
      <ColorModeScope value="hardware">{deck}</ColorModeScope>,
    );
    const background = () =>
      StyleSheet.flatten(screen.getByTestId('deck').props.style)
        .backgroundColor;
    expect(background()).toBe(hardware);
    await rerender(<ColorModeScope value="canvas">{deck}</ColorModeScope>);
    expect(background()).toBe(canvas);
    await rerender(<ColorModeScope value="hardware">{deck}</ColorModeScope>);
    expect(background()).toBe(hardware);
  });
});
