import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Key, type KeyIconProps } from './Key';
import { resolveTheme } from '../../theme';
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

const renderWithPreferences = (ui: React.ReactElement) => render(ui);

describe('Key', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferenceStore();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stays sunk after a quick tap latches it (onPressOut after onPress)', async () => {
    jest.useFakeTimers();
    await renderWithPreferences(<LatchingKey />);
    const button = screen.getByRole('button', { name: 'Play' });

    await fireEvent(button, 'pressIn');
    await fireEvent.press(button);
    // A quick tap can deliver press-out after press; it must not un-latch.
    await act(async () => {
      await fireEvent(button, 'pressOut');
      jest.advanceTimersByTime(500);
    });

    expect(screen.getByTestId('latch-raised')).toHaveAnimatedStyle({
      opacity: 0,
    });
    expect(screen.getByTestId('latch-down-icon')).toHaveAnimatedStyle({
      opacity: 1,
    });
  });

  it('renders an accessible button that reports latched state', async () => {
    await renderWithPreferences(
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

  it('can skip announcing the latch when the label names the action', async () => {
    await renderWithPreferences(
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

  it('calls onPress and fires the press haptic on press-in', async () => {
    const onPress = jest.fn();
    await renderWithPreferences(
      <Key icon={ColorIcon} accessibilityLabel="Play" onPress={onPress} />,
    );

    const button = screen.getByRole('button', { name: 'Play' });
    await fireEvent(button, 'pressIn');
    await fireEvent.press(button);

    expect(mockPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses and reports disabled when disabled', async () => {
    const onPress = jest.fn();
    await renderWithPreferences(
      <Key
        icon={ColorIcon}
        accessibilityLabel="Play"
        onPress={onPress}
        disabled
      />,
    );

    const button = screen.getByRole('button', { name: 'Play' });
    await fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
    expect(button.props.accessibilityState).toMatchObject({
      disabled: true,
      selected: false,
    });
  });

  it('fades only the icon when disabled, keeping the key solid', async () => {
    await renderWithPreferences(
      <Key icon={ColorIcon} accessibilityLabel="Play" disabled testID="k" />,
    );

    const [restIcon] = screen.getAllByTestId('key-icon');
    expect(restIcon).toHaveTextContent(resolveTheme().roles.fgSecondary);
    expect(
      StyleSheet.flatten(screen.getByTestId('k-icon').props.style),
    ).toMatchObject({
      opacity: resolveTheme().opacity.disabled,
    });
    expect(
      StyleSheet.flatten(screen.getByTestId('k').props.style),
    ).not.toHaveProperty('opacity');
  });

  it('keeps the disabled icon distinct from the key face in every mode', async () => {
    for (const mode of ['canvas', 'hardware', 'accent'] as const) {
      const { unmount } = await renderWithPreferences(
        <ColorModeScope value={mode}>
          <Key icon={ColorIcon} accessibilityLabel="Play" disabled />
        </ColorModeScope>,
      );
      const roles = resolveTheme(mode).roles;
      const [restIcon] = screen.getAllByTestId('key-icon');
      expect(restIcon).toHaveTextContent(roles.fgSecondary);
      expect(roles.fgSecondary).not.toBe(roles.surfaceDefault);
      await unmount();
    }
  });

  it('fades fg/primary over fg/secondary as the key goes down', async () => {
    jest.useFakeTimers();
    const { rerender } = await renderWithPreferences(
      <Key icon={ColorIcon} accessibilityLabel="Play" testID="k" />,
    );
    const [restIcon, downIcon] = screen.getAllByTestId('key-icon');
    expect(restIcon).toHaveTextContent(resolveTheme().roles.fgSecondary);
    expect(downIcon).toHaveTextContent(resolveTheme().roles.fgPrimary);
    expect(screen.getByTestId('k-down-icon')).toHaveAnimatedStyle({
      opacity: 0,
    });

    await rerender(
      <Key icon={ColorIcon} accessibilityLabel="Play" testID="k" active />,
    );
    await act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('k-down-icon')).toHaveAnimatedStyle({
      opacity: 1,
    });
  });

  it('follows a color mode and returns to Hardware', async () => {
    const hardware = resolveTheme('hardware').roles.fgSecondary;
    const canvas = resolveTheme('canvas').roles.fgSecondary;
    expect(hardware).not.toBe(canvas);
    const key = <Key icon={ColorIcon} accessibilityLabel="Play" />;
    const { rerender } = await renderWithPreferences(
      <ColorModeScope value="hardware">{key}</ColorModeScope>,
    );
    expect(screen.getAllByTestId('key-icon')[0]).toHaveTextContent(hardware);
    await rerender(<ColorModeScope value="canvas">{key}</ColorModeScope>);
    expect(screen.getAllByTestId('key-icon')[0]).toHaveTextContent(canvas);
    await rerender(<ColorModeScope value="hardware">{key}</ColorModeScope>);
    expect(screen.getAllByTestId('key-icon')[0]).toHaveTextContent(hardware);
  });
});
