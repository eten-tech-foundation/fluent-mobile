import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';
import {
  SYNC_NOW_CELLULAR_DISABLED_MESSAGE,
  SYNC_NOW_OFFLINE_MESSAGE,
  SyncActionControls,
} from './SyncActionControls';
import { TRANSFER_OFFLINE_MESSAGE } from '../../constants/messages';
import { UiVersionOverride } from '../../theme/useTheme';
import { resolveTheme } from '../../theme/uiVersion';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) =>
    React.createElement(View, { ...props, testID: 'sync-action-test-icon' });
  return { Pause: Icon, Play: Icon, X: Icon };
});

describe('SyncActionControls', () => {
  const onPause = jest.fn();
  const onResume = jest.fn();
  const onCancel = jest.fn();
  const onSyncNow = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    mockPreferenceStore();
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

  it('disables Sync Now without hint when syncNowDisabled and no hint', () => {
    const { getByTestId, queryByText } = renderControls({
      status: 'pending',
      syncNowDisabled: true,
    });

    expect(
      getByTestId('sync-action-sync-now').props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
    expect(queryByText(SYNC_NOW_CELLULAR_DISABLED_MESSAGE)).toBeNull();
  });

  it('disables Sync Now and shows explanation when hint provided', () => {
    const { getByTestId, getByText } = renderControls({
      status: 'pending',
      syncNowDisabled: true,
      syncNowDisabledHint: SYNC_NOW_CELLULAR_DISABLED_MESSAGE,
    });

    expect(
      getByTestId('sync-action-sync-now').props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
    expect(getByText(SYNC_NOW_CELLULAR_DISABLED_MESSAGE)).toBeTruthy();
  });

  it('disables Sync Now and shows a custom explanation when provided', () => {
    const { getByTestId, getByText, queryByText } = renderControls({
      status: 'pending',
      syncNowDisabled: true,
      syncNowDisabledHint: TRANSFER_OFFLINE_MESSAGE,
    });

    expect(
      getByTestId('sync-action-sync-now').props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
    expect(getByText(TRANSFER_OFFLINE_MESSAGE)).toBeTruthy();
    expect(getByText(SYNC_NOW_OFFLINE_MESSAGE)).toBeTruthy();
    expect(queryByText(SYNC_NOW_CELLULAR_DISABLED_MESSAGE)).toBeNull();
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

  it('isolates Next controls while controlled busy and status changes keep their semantics', () => {
    const legacy = resolveTheme('legacy');
    const next = resolveTheme('next');
    const colors = next.colors as {
      cardBackground: string;
      foreground: string;
      primary: string;
      primaryForeground: string;
      mutedForeground: string;
      border: string;
    };
    const spacing = next.spacing as { sm: number };
    const radius = next.radius as { lg: number };
    const original = {
      colors: { ...colors },
      spacing: spacing.sm,
      radius: radius.lg,
    };
    const tree = (
      version: 'legacy' | 'next',
      overrides: Partial<React.ComponentProps<typeof SyncActionControls>> = {},
    ) => (
      <UiVersionOverride value={version}>
        <SyncActionControls
          status="pending"
          onPause={onPause}
          onResume={onResume}
          onCancel={onCancel}
          onSyncNow={onSyncNow}
          {...overrides}
        />
      </UiVersionOverride>
    );
    try {
      Object.assign(colors, {
        cardBackground: '#123456',
        foreground: '#234567',
        primary: '#345678',
        primaryForeground: '#456789',
        mutedForeground: '#56789a',
        border: '#6789ab',
      });
      spacing.sm = 19;
      radius.lg = 23;
      const view = render(tree('legacy'));
      const button = () => view.getByTestId('sync-action-sync-now');
      const iconColor = (id: string) =>
        within(view.getByTestId(id)).getByTestId('sync-action-test-icon').props
          .color;
      expect(button()).toHaveStyle({
        backgroundColor: legacy.colors.primary,
        borderRadius: legacy.radius.lg,
        paddingVertical: legacy.spacing.sm,
      });
      expect(view.getByText('Sync Now')).toHaveStyle({
        color: legacy.colors.primaryForeground,
      });
      view.rerender(tree('next'));
      expect(button()).toHaveStyle({
        backgroundColor: '#345678',
        borderColor: '#345678',
        borderRadius: 23,
        paddingVertical: 19,
      });
      expect(view.getByText('Sync Now')).toHaveStyle({ color: '#456789' });
      expect(iconColor('sync-action-sync-now')).toBe('#456789');
      view.rerender(
        tree('next', {
          busy: true,
          syncNowDisabled: true,
          syncNowDisabledHint: TRANSFER_OFFLINE_MESSAGE,
        }),
      );
      expect(button().props.accessibilityState.disabled).toBe(true);
      expect(view.getByText('Sync Now')).toHaveStyle({ color: '#56789a' });
      expect(
        view.getByTestId('sync-action-sync-now-disabled-hint'),
      ).toHaveStyle({ color: '#56789a' });
      expect(iconColor('sync-action-sync-now')).toBe('#56789a');
      fireEvent.press(button());
      expect(onSyncNow).not.toHaveBeenCalled();
      view.rerender(tree('next', { status: 'paused', busy: true }));
      expect(
        view.getByTestId('sync-action-resume').props.accessibilityState
          .disabled,
      ).toBe(false);
      expect(view.getByText('Resume')).toHaveStyle({ color: '#234567' });
      expect(view.getByTestId('sync-action-resume')).toHaveStyle({
        backgroundColor: '#123456',
        borderColor: '#6789ab',
      });
      fireEvent.press(view.getByTestId('sync-action-resume'));
      expect(onResume).toHaveBeenCalledTimes(1);
      view.rerender(tree('next', { status: 'paused', controlPending: true }));
      expect(
        view.getByTestId('sync-action-resume').props.accessibilityState
          .disabled,
      ).toBe(true);
      expect(view.getByText('Resume')).toHaveStyle({ color: '#56789a' });
      fireEvent.press(view.getByTestId('sync-action-resume'));
      expect(onResume).toHaveBeenCalledTimes(1);
      view.rerender(tree('next', { status: 'syncing', busy: true }));
      expect(view.queryByTestId('sync-action-sync-now')).toBeNull();
      expect(
        view.getByTestId('sync-action-pause').props.accessibilityState.disabled,
      ).toBe(false);
      expect(view.getByText('Pause')).toHaveStyle({ color: '#234567' });
      expect(iconColor('sync-action-pause')).toBe('#234567');
      fireEvent.press(view.getByTestId('sync-action-pause'));
      expect(onPause).toHaveBeenCalledTimes(1);
      view.rerender(tree('legacy', { status: 'syncing', busy: true }));
      expect(view.getByTestId('sync-action-pause')).toHaveStyle({
        backgroundColor: legacy.colors.cardBackground,
        borderColor: legacy.colors.border,
        borderRadius: legacy.radius.lg,
        paddingVertical: legacy.spacing.sm,
      });
      expect(view.getByText('Pause')).toHaveStyle({
        color: legacy.colors.foreground,
      });
      expect(iconColor('sync-action-pause')).toBe(legacy.colors.foreground);
      view.rerender(tree('legacy', { status: 'allComplete' }));
      expect(view.toJSON()).toBeNull();
    } finally {
      Object.assign(colors, original.colors);
      spacing.sm = original.spacing;
      radius.lg = original.radius;
    }
  });
});
