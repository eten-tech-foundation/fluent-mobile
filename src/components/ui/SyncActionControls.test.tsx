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

  it('keeps Pause and Cancel enabled while busy during syncing', () => {
    const { getByTestId } = renderControls({
      status: 'syncing',
      busy: true,
    });

    expect(getByTestId('sync-action-pause').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false }),
    );
    expect(getByTestId('sync-action-cancel').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false }),
    );
  });

  it('disables Pause and Cancel while controlPending in syncing state', () => {
    const { getByTestId } = renderControls({
      status: 'syncing',
      controlPending: true,
    });

    expect(getByTestId('sync-action-pause').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(getByTestId('sync-action-cancel').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it('disables Resume and Cancel while controlPending in paused state', () => {
    const { getByTestId } = renderControls({
      status: 'paused',
      controlPending: true,
    });

    expect(getByTestId('sync-action-resume').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(getByTestId('sync-action-cancel').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it('enables Resume in paused state when only metadata sync is busy', () => {
    const { getByTestId } = renderControls({
      status: 'paused',
      busy: true,
      controlPending: false,
    });

    expect(getByTestId('sync-action-resume').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false }),
    );
  });

  it('disables Sync Now while busy in pending state', () => {
    const { getByTestId } = renderControls({
      status: 'pending',
      busy: true,
    });

    expect(
      getByTestId('sync-action-sync-now').props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
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
