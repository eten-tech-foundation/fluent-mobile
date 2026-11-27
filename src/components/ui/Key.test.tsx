import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Key, type KeyIconProps } from './Key';
import { legacyTheme, resolveTheme } from '../../theme';
import { ColorModeScope, UiVersionOverride } from '../../theme/useTheme';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';
import { UiVersionPreferenceProvider } from '../../theme/UiVersionPreferenceProvider';

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

const renderWithPreferences = (ui: React.ReactElement) =>
  render(ui, { wrapper: UiVersionPreferenceProvider });

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
      <UiVersionOverride value="legacy">
        <Key icon={ColorIcon} accessibilityLabel="Play" disabled testID="k" />
      </UiVersionOverride>,
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

  it('keeps the disabled icon distinct from the key face in every mode', async () => {
    for (const mode of ['canvas', 'hardware', 'accent'] as const) {
      const { unmount } = await renderWithPreferences(
        <ColorModeScope value={mode}>
          <Key icon={ColorIcon} accessibilityLabel="Play" disabled />
        </ColorModeScope>,
      );
      const roles = resolveTheme('next', mode).roles;
      const [restIcon] = screen.getAllByTestId('key-icon');
      expect(restIcon).toHaveTextContent(roles.fgSecondary);
      expect(roles.fgSecondary).not.toBe(roles.surfaceDefault);
      await unmount();
    }
  });

  it('fades fg/primary over fg/secondary as the key goes down', async () => {
    jest.useFakeTimers();
    const { rerender } = await renderWithPreferences(
      <UiVersionOverride value="legacy">
        <Key icon={ColorIcon} accessibilityLabel="Play" testID="k" />
      </UiVersionOverride>,
    );
    const [restIcon, downIcon] = screen.getAllByTestId('key-icon');
    expect(restIcon).toHaveTextContent(legacyTheme.roles.fgSecondary);
    expect(downIcon).toHaveTextContent(legacyTheme.roles.fgPrimary);
    expect(screen.getByTestId('k-down-icon')).toHaveAnimatedStyle({
      opacity: 0,
    });

    await rerender(
      <UiVersionOverride value="legacy">
        <Key icon={ColorIcon} accessibilityLabel="Play" testID="k" active />
      </UiVersionOverride>,
    );
    await act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('k-down-icon')).toHaveAnimatedStyle({
      opacity: 1,
    });
  });

  it('follows independently scoped Next roles and returns to Legacy at runtime', async () => {
    const roles = resolveTheme('next').roles as { fgSecondary: string };
    const original = roles.fgSecondary;
    try {
      roles.fgSecondary = '#123456';
      const { rerender } = await renderWithPreferences(
        <UiVersionOverride value="legacy">
          <Key icon={ColorIcon} accessibilityLabel="Play" />
        </UiVersionOverride>,
      );
      expect(screen.getAllByTestId('key-icon')[0]).toHaveTextContent(
        legacyTheme.roles.fgSecondary,
      );
      await rerender(
        <UiVersionOverride value="next">
          <Key icon={ColorIcon} accessibilityLabel="Play" />
        </UiVersionOverride>,
      );
      expect(screen.getAllByTestId('key-icon')[0]).toHaveTextContent('#123456');
      await rerender(
        <UiVersionOverride value="legacy">
          <Key icon={ColorIcon} accessibilityLabel="Play" />
        </UiVersionOverride>,
      );
      expect(screen.getAllByTestId('key-icon')[0]).toHaveTextContent(
        legacyTheme.roles.fgSecondary,
      );
    } finally {
      roles.fgSecondary = original;
    }
  });
});
