import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Dialog } from './Dialog';
import { getByHostType } from '../../test/hostElements';

jest.mock('../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));

function dialog(visible: boolean, onConfirm = jest.fn(), onCancel = jest.fn()) {
  return (
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
  );
}

describe('Dialog', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('asks its question with a primary and a quiet answer', async () => {
    await render(dialog(true));

    expect(
      screen.getByRole('header', { name: 'Send Mark 14 to Peer Check?' }),
    ).toBeTruthy();
    expect(
      screen.getByText('This marks Mark 14 as ready for Peer Check.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not yet' })).toBeTruthy();
  });

  it('confirms from the primary button', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(dialog(true, onConfirm, onCancel));

    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels from the quiet button, the scrim and Back', async () => {
    const onCancel = jest.fn();
    await render(dialog(true, jest.fn(), onCancel));

    await fireEvent.press(screen.getByRole('button', { name: 'Not yet' }));
    await fireEvent.press(screen.getByTestId('dialog-scrim'));
    await fireEvent(getByHostType('Modal'), 'requestClose');
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it('keeps the scrim out of TalkBack, which has Not yet', async () => {
    await render(dialog(true));

    expect(
      screen.getByTestId('dialog-scrim').props.importantForAccessibility,
    ).toBe('no');
  });

  it('ignores a second tap while it fades away', async () => {
    jest.useFakeTimers();
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const { rerender } = await render(dialog(true, onConfirm, onCancel));

    await rerender(dialog(false, onConfirm, onCancel));
    await fireEvent.press(screen.getByTestId('dialog-confirm'));
    await fireEvent.press(screen.getByTestId('dialog-cancel'));
    await fireEvent.press(screen.getByTestId('dialog-scrim'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('fades away, then leaves', async () => {
    jest.useFakeTimers();
    const { rerender } = await render(dialog(true));

    await rerender(dialog(false));
    expect(screen.getByText('Not yet')).toBeTruthy();
    await act(() => jest.advanceTimersByTime(1000));
    expect(screen.queryByText('Not yet')).toBeNull();
  });

  it('renders nothing until opened', async () => {
    await render(dialog(false));

    expect(screen.queryByText('Send Mark 14 to Peer Check?')).toBeNull();
  });
});
