import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Banner } from './Banner';
import { resolveTheme } from '../../theme';
import { UiVersionOverride } from '../../theme/useTheme';

jest.mock('../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

const next = resolveTheme('next');

describe('Banner', () => {
  it('shows the message on surface/inverse and runs its action', () => {
    const onAction = jest.fn();
    render(
      <UiVersionOverride value="next">
        <Banner
          message="Session expired. Enter your password to keep syncing."
          actionLabel="Sign in"
          onAction={onAction}
          testID="banner"
        />
      </UiVersionOverride>,
    );

    expect(
      StyleSheet.flatten(screen.getByTestId('banner').props.style)
        .backgroundColor,
    ).toBe(next.roles.surfaceInverse);
    expect(
      screen.getByText('Session expired. Enter your password to keep syncing.'),
    ).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('announces the message when it appears', () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    render(
      <Banner message="Offline" actionLabel="Retry" onAction={jest.fn()} />,
    );
    expect(announce).toHaveBeenCalledWith('Offline');
    announce.mockRestore();
  });
});
