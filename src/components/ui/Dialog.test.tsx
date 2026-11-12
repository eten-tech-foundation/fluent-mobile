import React from 'react';
import { Modal } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Dialog } from './Dialog';
import { UiVersionOverride } from '../../theme/useTheme';

jest.mock('../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));

function dialog(visible: boolean, onConfirm = jest.fn(), onCancel = jest.fn()) {
  return (
    <UiVersionOverride value="next">
      <Dialog
        visible={visible}
        title="Send Mark 14 to Peer Check?"
        message="This marks Mark 14 as ready for Peer Check."
        confirmLabel="Send"
        onConfirm={onConfirm}
        cancelLabel="Not yet"
        onCancel={onCancel}
        testID="dialog"
      />
    </UiVersionOverride>
  );
}

describe('Dialog', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('asks its question with a primary and a quiet answer', () => {
    render(dialog(true));

    expect(
      screen.getByRole('header', { name: 'Send Mark 14 to Peer Check?' }),
    ).toBeTruthy();
    expect(
      screen.getByText('This marks Mark 14 as ready for Peer Check.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not yet' })).toBeTruthy();
  });

  it('confirms from the primary button', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(dialog(true, onConfirm, onCancel));

    fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels from the quiet button, the scrim and Back', () => {
    const onCancel = jest.fn();
    render(dialog(true, jest.fn(), onCancel));

    fireEvent.press(screen.getByRole('button', { name: 'Not yet' }));
    fireEvent.press(screen.getByTestId('dialog-scrim'));
    fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it('keeps the scrim out of TalkBack, which has Not yet', () => {
    render(dialog(true));

    expect(
      screen.getByTestId('dialog-scrim').props.importantForAccessibility,
    ).toBe('no');
  });

  it('ignores a second tap while it fades away', () => {
    jest.useFakeTimers();
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const { rerender } = render(dialog(true, onConfirm, onCancel));

    rerender(dialog(false, onConfirm, onCancel));
    fireEvent.press(screen.getByTestId('dialog-confirm'));
    fireEvent.press(screen.getByTestId('dialog-cancel'));
    fireEvent.press(screen.getByTestId('dialog-scrim'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('fades away, then leaves', () => {
    jest.useFakeTimers();
    const { rerender } = render(dialog(true));

    rerender(dialog(false));
    expect(screen.getByText('Not yet')).toBeTruthy();
    act(() => jest.advanceTimersByTime(1000));
    expect(screen.queryByText('Not yet')).toBeNull();
  });

  it('renders nothing until opened', () => {
    render(dialog(false));

    expect(screen.queryByText('Send Mark 14 to Peer Check?')).toBeNull();
  });
});
