import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { RoundButton, type RoundButtonIconProps } from './RoundButton';
import { setUiVersion } from '../../services/userPreferences';
import { legacyTheme, resolveTheme } from '../../theme';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

const mockPress = jest.fn();
jest.mock('../../hooks/useHaptics', () => ({
  useHaptics: () => ({ press: mockPress }),
}));

function ColorIcon({ color }: RoundButtonIconProps) {
  return <Text testID="round-icon">{color}</Text>;
}

describe('RoundButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferenceStore();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calls onPress and fires the press haptic on press-in', () => {
    const onPress = jest.fn();
    render(
      <RoundButton
        icon={ColorIcon}
        accessibilityLabel="Download"
        onPress={onPress}
      />,
    );

    const button = screen.getByRole('button', { name: 'Download' });
    fireEvent(button, 'pressIn');
    fireEvent.press(button);

    expect(mockPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses, reports disabled and fades when disabled', () => {
    const onPress = jest.fn();
    render(
      <RoundButton
        icon={ColorIcon}
        accessibilityLabel="Download"
        onPress={onPress}
        disabled
        testID="b"
      />,
    );

    const button = screen.getByRole('button', { name: 'Download' });
    fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    expect(
      StyleSheet.flatten(screen.getByTestId('b').props.style),
    ).toMatchObject({ opacity: legacyTheme.opacity.disabled });
  });

  it('stretches into a pill with its label beside the icon', () => {
    const onPress = jest.fn();
    render(
      <RoundButton
        variant="flat"
        icon={ColorIcon}
        label="Listen"
        accessibilityLabel="Listen"
        onPress={onPress}
        testID="b"
      />,
    );

    expect(screen.getByText('Listen')).toBeTruthy();
    expect(
      StyleSheet.flatten(screen.getByTestId('b').props.style),
    ).toMatchObject({ width: undefined, minWidth: 48 });
    fireEvent.press(screen.getByLabelText('Listen'));
    expect(onPress).toHaveBeenCalled();
  });

  it('shows the rim on Soft only', () => {
    const { rerender } = render(
      <RoundButton icon={ColorIcon} accessibilityLabel="Download" testID="b" />,
    );
    expect(screen.getByTestId('b-rim')).toBeTruthy();

    rerender(
      <RoundButton
        icon={ColorIcon}
        accessibilityLabel="Download"
        variant="flat"
        testID="b"
      />,
    );
    expect(screen.queryByTestId('b-rim')).toBeNull();
  });

  it('pins Flat to Canvas colors in Next, whatever the surrounding mode', () => {
    act(() => {
      setUiVersion('next');
    });
    render(
      <RoundButton
        icon={ColorIcon}
        accessibilityLabel="Download"
        variant="flat"
      />,
    );

    expect(screen.getByTestId('round-icon')).toHaveTextContent(
      resolveTheme('next', 'canvas').roles.fgPrimary,
    );
  });

  it('fades the raised face out while pressed', () => {
    jest.useFakeTimers();
    render(
      <RoundButton
        icon={ColorIcon}
        accessibilityLabel="Download"
        onPress={jest.fn()}
        testID="b"
      />,
    );

    fireEvent(screen.getByRole('button', { name: 'Download' }), 'pressIn');
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(screen.getByTestId('b-raised')).toHaveAnimatedStyle({ opacity: 0 });
  });
});
