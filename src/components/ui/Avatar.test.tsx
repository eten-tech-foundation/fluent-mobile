import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Avatar } from './Avatar';
import { resolveTheme } from '../../theme';

jest.mock('../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

const next = resolveTheme();

describe('Avatar', () => {
  it('shows the initials on surface/inverse and opens on press', async () => {
    const onPress = jest.fn();
    await render(
      <Avatar
        initials="JS"
        accessibilityLabel="Jordan Smith. Accounts"
        onPress={onPress}
        testID="avatar"
      />,
    );

    const button = screen.getByRole('button', {
      name: 'Jordan Smith. Accounts',
    });
    expect(StyleSheet.flatten(button.props.style).backgroundColor).toBe(
      next.roles.surfaceInverse,
    );
    expect(StyleSheet.flatten(screen.getByText('JS').props.style).color).toBe(
      next.roles.fgOnInverse,
    );

    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is a plain picture without a press, left to its row to speak', async () => {
    await render(<Avatar initials="RK" testID="avatar" />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('RK')).toBeNull();
    expect(
      screen.getByText('RK', { includeHiddenElements: true }),
    ).toBeTruthy();
  });
});
