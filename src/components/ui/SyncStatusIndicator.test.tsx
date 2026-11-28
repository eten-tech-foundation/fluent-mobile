import React from 'react';
import { render } from '@testing-library/react-native';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { resolveTheme } from '../../theme';
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
  ] as const)(
    'preserves status mapping for %o',
    async (props, status, animated) => {
      const view = await render(<SyncStatusIndicator {...props} />);
      expect(view.getByTestId('indicator-cloud').props).toEqual(
        expect.objectContaining({
          status,
          animated,
          size: 48,
          decorative: true,
        }),
      );
    },
  );

  it('uses the active palette while status changes stay independent', async () => {
    const next = resolveTheme();
    const colors = next.colors as {
      cardBackground: string;
      mutedForeground: string;
    };
    const original = {
      cardBackground: colors.cardBackground,
      mutedForeground: colors.mutedForeground,
    };
    const tree = (
      _version: 'legacy' | 'next',
      status: 'pending' | 'paused' = 'pending',
    ) => <SyncStatusIndicator status={status} />;
    try {
      Object.assign(colors, {
        cardBackground: '#123456',
        mutedForeground: '#456789',
      });
      const view = await render(tree('legacy'));
      const cloud = () => view.getByTestId('indicator-cloud');
      expect(cloud().props.cloudColor).toBe(next.colors.mutedForeground);
      expect(view.root).toHaveStyle({
        backgroundColor: next.colors.cardBackground,
        width: 96,
        height: 96,
        borderRadius: 48,
      });
      await view.rerender(tree('next'));
      expect(cloud().props.cloudColor).toBe('#456789');
      expect(view.root).toHaveStyle({
        backgroundColor: '#123456',
        width: 96,
        height: 96,
        borderRadius: 48,
      });
      await view.rerender(tree('next', 'paused'));
      expect(cloud().props).toEqual(
        expect.objectContaining({
          status: 'online_syncing',
          animated: false,
          cloudColor: '#456789',
        }),
      );
      await view.rerender(tree('legacy'));
      expect(cloud().props.cloudColor).toBe(next.colors.mutedForeground);
      expect(view.root).toHaveStyle({
        backgroundColor: next.colors.cardBackground,
      });
    } finally {
      Object.assign(colors, original);
    }
  });
});
