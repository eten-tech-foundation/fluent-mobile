import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BottomSheet } from './BottomSheet';
import { getByHostType } from '../../test/hostElements';

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
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Accounts on this device"
      testID="sheet"
    >
      <Text>Jordan Smith</Text>
    </BottomSheet>
  );
}

describe('BottomSheet', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows its title and content when open', async () => {
    await render(sheet(true));

    expect(
      screen.getByRole('header', { name: 'Accounts on this device' }),
    ).toBeTruthy();
    expect(screen.getByText('Jordan Smith')).toBeTruthy();
  });

  it('closes from the scrim', async () => {
    const onClose = jest.fn();
    await render(sheet(true, onClose));

    await fireEvent.press(screen.getByTestId('sheet-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('slides away, then leaves', async () => {
    jest.useFakeTimers();
    const { rerender } = await render(sheet(true));

    await rerender(sheet(false));
    expect(screen.getByText('Jordan Smith')).toBeTruthy();
    await act(() => jest.advanceTimersByTime(1000));
    expect(screen.queryByText('Jordan Smith')).toBeNull();
  });

  it('closes on Back', async () => {
    const onClose = jest.fn();
    await render(sheet(true, onClose));

    await fireEvent(getByHostType('Modal'), 'requestClose');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
