import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Switch } from './Switch';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

const mockToggle = jest.fn();
jest.mock('../../hooks/useHaptics', () => ({
  useHaptics: () => ({ toggle: mockToggle }),
}));

function ControlledSwitch({ disabled = false }: { disabled?: boolean }) {
  const [on, setOn] = useState(false);
  return (
    <Switch
      value={on}
      onValueChange={setOn}
      accessibilityLabel="Auto-play"
      disabled={disabled}
      testID="switch"
    />
  );
}

describe('Switch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferenceStore();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('toggles, reports checked and fires the matching haptic', () => {
    render(<ControlledSwitch />);
    const control = screen.getByRole('switch', { name: 'Auto-play' });
    expect(control.props.accessibilityState).toMatchObject({ checked: false });

    fireEvent.press(control);
    expect(control.props.accessibilityState).toMatchObject({ checked: true });
    expect(mockToggle).toHaveBeenLastCalledWith(true);

    fireEvent.press(control);
    expect(mockToggle).toHaveBeenLastCalledWith(false);
  });

  it('ignores presses and reports disabled when disabled', () => {
    render(<ControlledSwitch disabled />);
    const control = screen.getByRole('switch', { name: 'Auto-play' });

    fireEvent.press(control);

    expect(control.props.accessibilityState).toMatchObject({
      checked: false,
      disabled: true,
    });
    expect(mockToggle).not.toHaveBeenCalled();
  });

  it('slides the knob across the track when switched on', () => {
    jest.useFakeTimers();
    render(<ControlledSwitch />);

    fireEvent.press(screen.getByRole('switch', { name: 'Auto-play' }));
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // 88 track − 2 × 4 padding − 44 knob
    expect(screen.getByTestId('switch-knob')).toHaveAnimatedStyle({
      transform: [{ translateX: 36 }],
    });
  });
});
