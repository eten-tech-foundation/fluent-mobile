import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Key, type KeyIconProps } from './Key';
import { setUiVersion } from '../../services/userPreferences';
import { legacyTheme, resolveTheme } from '../../theme';
import { ColorModeScope } from '../../theme/useTheme';
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

function ColorIcon({ color }: KeyIconProps) {
  return <Text testID="key-icon">{color}</Text>;
}

function LatchingKey() {
  const [on, setOn] = useState(false);
  return (
    <Key
      icon={ColorIcon}
      accessibilityLabel="Play"
      active={on}
      onPress={() => setOn(value => !value)}
      testID="latch"
    />
  );
}

describe('Key', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferenceStore();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stays sunk after a quick tap latches it (onPressOut after onPress)', () => {
    jest.useFakeTimers();
    render(<LatchingKey />);
    const button = screen.getByRole('button', { name: 'Play' });

    // Pressability keeps the onPressOut from press-in time and can call it
    // after onPress on a quick tap, so capture it before the latch toggles.
    fireEvent(button, 'pressIn');
    let pressable: ReactTestInstance | null = button;
    while (pressable && !pressable.props.onPressOut) {
      pressable = pressable.parent;
    }
    const stalePressOut = pressable?.props.onPressOut;
    fireEvent.press(button);
    act(() => {
      stalePressOut();
      jest.advanceTimersByTime(500);
    });

    expect(screen.getByTestId('latch-raised')).toHaveAnimatedStyle({
      opacity: 0,
    });
    expect(screen.getByTestId('latch-down-icon')).toHaveAnimatedStyle({
      opacity: 1,
    });
  });

  it('renders an accessible button that reports latched state', () => {
    render(
      <Key
        icon={ColorIcon}
        accessibilityLabel="Play"
        onPress={jest.fn()}
        active
      />,
    );

    const button = screen.getByRole('button', { name: 'Play' });
    expect(button.props.accessibilityState).toMatchObject({
      disabled: false,
      selected: true,
    });
  });

  it('can skip announcing the latch when the label names the action', () => {
    render(
      <Key
        icon={ColorIcon}
        accessibilityLabel="Pause"
        onPress={jest.fn()}
        active
        announceLatched={false}
      />,
    );

    const button = screen.getByRole('button', { name: 'Pause' });
    expect(button.props.accessibilityState).toMatchObject({ selected: false });
  });

  it('calls onPress and fires the press haptic on press-in', () => {
    const onPress = jest.fn();
    render(
      <Key icon={ColorIcon} accessibilityLabel="Play" onPress={onPress} />,
    );

    const button = screen.getByRole('button', { name: 'Play' });
    fireEvent(button, 'pressIn');
    fireEvent.press(button);

    expect(mockPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses and reports disabled when disabled', () => {
    const onPress = jest.fn();
    render(
      <Key
        icon={ColorIcon}
        accessibilityLabel="Play"
        onPress={onPress}
        disabled
      />,
    );

    const button = screen.getByRole('button', { name: 'Play' });
    fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
    expect(button.props.accessibilityState).toMatchObject({
      disabled: true,
      selected: false,
    });
  });

  it('fades only the icon when disabled, keeping the key solid', () => {
    render(
      <Key icon={ColorIcon} accessibilityLabel="Play" disabled testID="k" />,
    );

    const [restIcon] = screen.getAllByTestId('key-icon');
    expect(restIcon).toHaveTextContent(legacyTheme.roles.fgSecondary);
    expect(
      StyleSheet.flatten(screen.getByTestId('k-icon').props.style),
    ).toMatchObject({
      opacity: legacyTheme.opacity.disabled,
    });
    expect(
      StyleSheet.flatten(screen.getByTestId('k').props.style),
    ).not.toHaveProperty('opacity');
  });

  it('keeps the disabled icon distinct from the key face in every mode', () => {
    act(() => {
      setUiVersion('next');
    });
    for (const mode of ['canvas', 'hardware', 'accent'] as const) {
      const { unmount } = render(
        <ColorModeScope value={mode}>
          <Key icon={ColorIcon} accessibilityLabel="Play" disabled />
        </ColorModeScope>,
      );
      const roles = resolveTheme('next', mode).roles;
      const [restIcon] = screen.getAllByTestId('key-icon');
      expect(restIcon).toHaveTextContent(roles.fgSecondary);
      expect(roles.fgSecondary).not.toBe(roles.surfaceDefault);
      unmount();
    }
  });

  it('fades fg/primary over fg/secondary as the key goes down', () => {
    jest.useFakeTimers();
    const { rerender } = render(
      <Key icon={ColorIcon} accessibilityLabel="Play" testID="k" />,
    );
    const [restIcon, downIcon] = screen.getAllByTestId('key-icon');
    expect(restIcon).toHaveTextContent(legacyTheme.roles.fgSecondary);
    expect(downIcon).toHaveTextContent(legacyTheme.roles.fgPrimary);
    expect(screen.getByTestId('k-down-icon')).toHaveAnimatedStyle({
      opacity: 0,
    });

    rerender(
      <Key icon={ColorIcon} accessibilityLabel="Play" testID="k" active />,
    );
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('k-down-icon')).toHaveAnimatedStyle({
      opacity: 1,
    });
  });

  it('follows the Next Hardware roles when the UI version is Next', () => {
    render(<Key icon={ColorIcon} accessibilityLabel="Play" />);

    act(() => {
      setUiVersion('next');
    });

    expect(screen.getAllByTestId('key-icon')[0]).toHaveTextContent('#5E5E5A');
  });
});
