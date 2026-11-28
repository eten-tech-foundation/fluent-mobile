import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { HardwarePanel } from './HardwarePanel';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }),
}));

const mockToggle = jest.fn();
jest.mock('../../hooks/useHaptics', () => ({
  useHaptics: () => ({ toggle: mockToggle, press: jest.fn() }),
}));

function Panel({ locked = false }: { locked?: boolean }) {
  const [recordMode, setRecordMode] = useState(false);
  return (
    <HardwarePanel
      recordMode={recordMode}
      onRecordModeChange={setRecordMode}
      modeLocked={locked}
      testID="panel"
    >
      <Text>{recordMode ? 'record keys' : 'listen keys'}</Text>
    </HardwarePanel>
  );
}

describe('HardwarePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferenceStore();
  });

  it('flips between Listen and Record from the mode toggle', async () => {
    await render(<Panel />);
    expect(screen.getByText('listen keys')).toBeTruthy();

    await fireEvent.press(screen.getByRole('switch', { name: 'Record mode' }));

    expect(screen.getByText('record keys')).toBeTruthy();
    expect(mockToggle).toHaveBeenLastCalledWith(true);
    expect(
      screen.getByRole('switch', { name: 'Record mode' }).props
        .accessibilityState,
    ).toMatchObject({ checked: true });
  });

  it('locks the mode while a take is in progress', async () => {
    await render(<Panel locked />);

    const toggle = screen.getByRole('switch', { name: 'Record mode' });
    expect(toggle.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(toggle);
    expect(screen.getByText('listen keys')).toBeTruthy();
    expect(mockToggle).not.toHaveBeenCalled();
  });

  it('pads for the gesture bar unless told not to', async () => {
    const { unmount } = await render(<Panel />);
    expect(
      StyleSheet.flatten(screen.getByTestId('panel').props.style).paddingBottom,
    ).toBe(24);
    await unmount();

    await render(
      <HardwarePanel
        recordMode={false}
        onRecordModeChange={jest.fn()}
        safeAreaBottom={false}
        testID="panel"
      >
        <Text>keys</Text>
      </HardwarePanel>,
    );
    expect(
      StyleSheet.flatten(screen.getByTestId('panel').props.style).paddingBottom,
    ).toBeUndefined();
  });

  it('keeps the speaker grill out of TalkBack', async () => {
    await render(<Panel />);

    expect(screen.queryByTestId('panel-grill')).toBeNull();
    expect(
      screen.getByTestId('panel-grill', { includeHiddenElements: true }),
    ).toBeTruthy();
  });
});
