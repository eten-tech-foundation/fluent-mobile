import React from 'react';
import { Modal, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BottomSheet } from './BottomSheet';
import { UiVersionOverride } from '../../theme/useTheme';

jest.mock('react-native-gesture-handler', () => {
  const pan = {
    activeOffsetY: () => pan,
    onUpdate: () => pan,
    onEnd: () => pan,
  };
  const Pass = ({ children }: { children: React.ReactNode }) => children;
  return {
    Gesture: { Pan: () => pan },
    GestureDetector: Pass,
    GestureHandlerRootView: Pass,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));

function sheet(visible: boolean, onClose = jest.fn()) {
  return (
    <UiVersionOverride value="next">
      <BottomSheet
        visible={visible}
        onClose={onClose}
        title="Accounts on this device"
        testID="sheet"
      >
        <Text>Jordan Smith</Text>
      </BottomSheet>
    </UiVersionOverride>
  );
}

describe('BottomSheet', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows its title and content when open', () => {
    render(sheet(true));

    expect(
      screen.getByRole('header', { name: 'Accounts on this device' }),
    ).toBeTruthy();
    expect(screen.getByText('Jordan Smith')).toBeTruthy();
  });

  it('closes from the scrim', () => {
    const onClose = jest.fn();
    render(sheet(true, onClose));

    fireEvent.press(screen.getByTestId('sheet-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('slides away, then leaves', () => {
    jest.useFakeTimers();
    const { rerender } = render(sheet(true));

    rerender(sheet(false));
    expect(screen.getByText('Jordan Smith')).toBeTruthy();
    act(() => jest.advanceTimersByTime(1000));
    expect(screen.queryByText('Jordan Smith')).toBeNull();
  });

  it('closes on Back', () => {
    const onClose = jest.fn();
    render(sheet(true, onClose));

    fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
