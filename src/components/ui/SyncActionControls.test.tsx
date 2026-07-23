import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import {
  SYNC_NOW_CELLULAR_DISABLED_MESSAGE,
  SyncActionControls,
} from './SyncActionControls';

describe('SyncActionControls', () => {
  const onPause = jest.fn();
  const onResume = jest.fn();
  const onCancel = jest.fn();
  const onSyncNow = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
  });

  function renderControls(
    overrides: Partial<React.ComponentProps<typeof SyncActionControls>> = {},
  ) {
    return render(
      <SyncActionControls
        status="pending"
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
        onSyncNow={onSyncNow}
        {...overrides}
      />,
    );
  }

  it('shows Pause and Cancel while syncing', () => {
    const { getByTestId, queryByTestId } = renderControls({
      status: 'syncing',
    });

    expect(getByTestId('sync-action-pause')).toBeTruthy();
    expect(getByTestId('sync-action-cancel')).toBeTruthy();
    expect(queryByTestId('sync-action-sync-now')).toBeNull();
  });

  it('shows Resume, Sync Now, and Cancel while paused', () => {
    const { getByTestId } = renderControls({ status: 'paused' });

    expect(getByTestId('sync-action-resume')).toBeTruthy();
    expect(getByTestId('sync-action-sync-now')).toBeTruthy();
    expect(getByTestId('sync-action-cancel')).toBeTruthy();
  });

  it('shows Sync Now while pending', () => {
    const { getByTestId, queryByTestId } = renderControls({
      status: 'pending',
    });

    expect(getByTestId('sync-action-sync-now')).toBeTruthy();
    expect(queryByTestId('sync-action-pause')).toBeNull();
  });

  it('hides controls for uploadComplete and allComplete', () => {
    const uploadComplete = renderControls({ status: 'uploadComplete' });
    expect(uploadComplete.toJSON()).toBeNull();

    const allComplete = renderControls({ status: 'allComplete' });
    expect(allComplete.toJSON()).toBeNull();
  });

  it('disables Sync Now and shows explanation when syncNowDisabled', () => {
    const { getByTestId, getByText } = renderControls({
      status: 'pending',
      syncNowDisabled: true,
    });

    expect(
      getByTestId('sync-action-sync-now').props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
    expect(getByText(SYNC_NOW_CELLULAR_DISABLED_MESSAGE)).toBeTruthy();
  });

  it('invokes callbacks for syncing controls', () => {
    const { getByTestId } = renderControls({ status: 'syncing' });

    fireEvent.press(getByTestId('sync-action-pause'));
    fireEvent.press(getByTestId('sync-action-cancel'));

    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('invokes callbacks for paused controls', () => {
    const { getByTestId } = renderControls({ status: 'paused' });

    fireEvent.press(getByTestId('sync-action-resume'));
    fireEvent.press(getByTestId('sync-action-sync-now'));
    fireEvent.press(getByTestId('sync-action-cancel'));

    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onSyncNow).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not call onSyncNow when Sync Now is disabled', () => {
    const { getByTestId } = renderControls({
      status: 'pending',
      syncNowDisabled: true,
    });

    fireEvent.press(getByTestId('sync-action-sync-now'));
    expect(onSyncNow).not.toHaveBeenCalled();
  });
});
