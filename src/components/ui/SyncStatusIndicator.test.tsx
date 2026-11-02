import React from 'react';
import { render } from '@testing-library/react-native';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { UiVersionOverride } from '../../theme/useTheme';
import { resolveTheme } from '../../theme/uiVersion';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));
jest.mock('./CloudSyncStatusIcon', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CloudSyncStatusIcon: (props: Record<string, unknown>) =>
      React.createElement(View, { ...props, testID: 'indicator-cloud' }),
  };
});

describe('SyncStatusIndicator', () => {
  beforeEach(() => {
    mockPreferenceStore();
  });

  it.each([
    [{ status: 'pending' }, 'online_synced', false],
    [{ status: 'pending', isOnline: false }, 'offline_synced', false],
    [{ status: 'pending', hasPendingUploads: true }, 'online_pending', false],
    [
      { status: 'pending', hasPendingUploads: true, isOnline: false },
      'offline_pending',
      false,
    ],
    [{ status: 'pending', hasFailedUploads: true }, 'online_failed', false],
    [
      { status: 'pending', hasFailedUploads: true, isOnline: false },
      'offline_synced',
      false,
    ],
    [{ status: 'syncing' }, 'online_syncing', true],
    [{ status: 'paused' }, 'online_syncing', false],
    [{ status: 'paused', isUploading: true }, 'online_syncing', true],
    [{ status: 'uploadComplete' }, 'online_synced', false],
    [{ status: 'allComplete' }, 'online_synced', false],
  ] as const)('preserves status mapping for %o', (props, status, animated) => {
    const view = render(<SyncStatusIndicator {...props} />);
    expect(view.getByTestId('indicator-cloud').props).toEqual(
      expect.objectContaining({ status, animated, size: 48, decorative: true }),
    );
  });

  it('uses the scoped palette while status changes and Legacy return stay independent', () => {
    const legacy = resolveTheme('legacy');
    const next = resolveTheme('next');
    const colors = next.colors as {
      cardBackground: string;
      mutedForeground: string;
    };
    const original = {
      cardBackground: colors.cardBackground,
      mutedForeground: colors.mutedForeground,
    };
    const tree = (
      version: 'legacy' | 'next',
      status: 'pending' | 'paused' = 'pending',
    ) => (
      <UiVersionOverride value={version}>
        <SyncStatusIndicator status={status} />
      </UiVersionOverride>
    );
    try {
      Object.assign(colors, {
        cardBackground: '#123456',
        mutedForeground: '#456789',
      });
      const view = render(tree('legacy'));
      const cloud = () => view.getByTestId('indicator-cloud');
      expect(cloud().props.cloudColor).toBe(legacy.colors.mutedForeground);
      expect(view.root).toHaveStyle({
        backgroundColor: legacy.colors.cardBackground,
        width: 96,
        height: 96,
        borderRadius: 48,
      });
      view.rerender(tree('next'));
      expect(cloud().props.cloudColor).toBe('#456789');
      expect(view.root).toHaveStyle({
        backgroundColor: '#123456',
        width: 96,
        height: 96,
        borderRadius: 48,
      });
      view.rerender(tree('next', 'paused'));
      expect(cloud().props).toEqual(
        expect.objectContaining({
          status: 'online_syncing',
          animated: false,
          cloudColor: '#456789',
        }),
      );
      view.rerender(tree('legacy'));
      expect(cloud().props.cloudColor).toBe(legacy.colors.mutedForeground);
      expect(view.root).toHaveStyle({
        backgroundColor: legacy.colors.cardBackground,
      });
    } finally {
      Object.assign(colors, original);
    }
  });
});
