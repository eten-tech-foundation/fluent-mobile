import React from 'react';
import { Animated } from 'react-native';
import { render } from '@testing-library/react-native';
import { CloudSyncStatusIcon } from './CloudSyncStatusIcon';
import { SyncStatus, SYNC_STATUS_LABELS } from '../../utils/syncStatusState';
import { theme } from '../../theme';
import { UiVersionOverride } from '../../theme/useTheme';
import { resolveTheme } from '../../theme/uiVersion';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));

const renderedPaths: { d: string; stroke?: string }[] = [];

jest.mock('react-native-svg', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockSvg = (
    props: { accessibilityLabel?: string } & { children?: React.ReactNode },
  ) =>
    MockReact.createElement(
      View,
      { accessibilityLabel: props.accessibilityLabel },
      props.children,
    );
  const MockPath = (props: { d?: string; stroke?: string }) => {
    renderedPaths.push({ d: props.d ?? '', stroke: props.stroke });
    return MockReact.createElement(View);
  };

  return {
    __esModule: true,
    default: MockSvg,
    Path: MockPath,
  };
});

jest.mock('../../assets/icons/cloud-off-unsynced.svg', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return (props: { accessibilityLabel?: string; color?: string }) =>
    MockReact.createElement(View, {
      accessibilityLabel: props.accessibilityLabel,
      color: props.color,
      testID: 'cloud-off-unsynced-glyph',
    });
});

const ALL_STATUSES: SyncStatus[] = [
  'online_synced',
  'online_syncing',
  'online_uploading',
  'online_failed',
  'online_needs_sync',
  'online_pending',
  'offline_synced',
  'offline_pending',
];

const CLOUD_PATH_PREFIX = 'M5.516 16.07';
const CHECK_PATH = 'm17 15-5.5 5.5L9 18';

describe('CloudSyncStatusIcon', () => {
  beforeEach(() => {
    renderedPaths.length = 0;
    mockPreferenceStore();
  });

  it.each(ALL_STATUSES)('renders for status %s', status => {
    const { getByLabelText } = render(<CloudSyncStatusIcon status={status} />);

    expect(getByLabelText(SYNC_STATUS_LABELS[status])).toBeTruthy();
  });

  it('does not take presses when the parent button owns the label', () => {
    const { UNSAFE_getByType, queryByLabelText } = render(
      <CloudSyncStatusIcon status="online_synced" decorative />,
    );

    expect(UNSAFE_getByType(Animated.View).props.pointerEvents).toBe('none');
    expect(queryByLabelText(SYNC_STATUS_LABELS.online_synced)).toBeNull();
  });

  it('#38: offline_synced draws gray cloud-check, not cloud-off', () => {
    render(<CloudSyncStatusIcon status="offline_synced" />);

    const cloud = renderedPaths.find(p => p.d.startsWith(CLOUD_PATH_PREFIX));
    const check = renderedPaths.find(p => p.d === CHECK_PATH);

    // Gray cloud outline…
    expect(cloud).toBeDefined();
    expect(cloud?.stroke).toBe(theme.colors.syncStatusOffline);
    // …with the cloud-check tick in the same gray.
    expect(check).toBeDefined();
    expect(check?.stroke).toBe(theme.colors.syncStatusOffline);
  });

  it('isolates Next glyph colors across status/override changes and restores Legacy colors', () => {
    const legacy = resolveTheme('legacy');
    const next = resolveTheme('next');
    const colors = next.colors as {
      primaryForeground: string;
      syncStatusSynced: string;
      syncStatusPending: string;
      syncStatusOffline: string;
      destructive: string;
    };
    const original = { ...colors };
    const tree = (
      version: 'legacy' | 'next',
      status: SyncStatus,
      cloudColor?: string,
    ) => (
      <UiVersionOverride value={version}>
        <CloudSyncStatusIcon
          status={status}
          animated={false}
          cloudColor={cloudColor}
        />
      </UiVersionOverride>
    );
    const stroke = (prefix: string) =>
      renderedPaths.find(path => path.d.startsWith(prefix))?.stroke;
    try {
      Object.assign(colors, {
        primaryForeground: '#101112',
        syncStatusSynced: '#202122',
        syncStatusPending: '#303132',
        syncStatusOffline: '#404142',
        destructive: '#505152',
      });
      const view = render(tree('legacy', 'online_synced'));
      expect(stroke(CLOUD_PATH_PREFIX)).toBe(legacy.colors.primaryForeground);
      expect(stroke(CHECK_PATH)).toBe(legacy.colors.syncStatusSynced);
      const show = (
        version: 'legacy' | 'next',
        status: SyncStatus,
        cloudColor?: string,
      ) => {
        renderedPaths.length = 0;
        view.rerender(tree(version, status, cloudColor));
      };
      show('next', 'online_synced');
      expect(stroke(CLOUD_PATH_PREFIX)).toBe('#101112');
      expect(stroke(CHECK_PATH)).toBe('#202122');
      show('next', 'online_synced', '#abcdef');
      expect(stroke(CLOUD_PATH_PREFIX)).toBe('#abcdef');
      expect(stroke(CHECK_PATH)).toBe('#202122');
      show('next', 'online_pending');
      expect(stroke(CLOUD_PATH_PREFIX)).toBe('#101112');
      expect(stroke('M12 13v8')).toBe('#303132');
      show('next', 'online_failed');
      expect(stroke('M12 13v8')).toBe('#505152');
      show('next', 'online_needs_sync', '#abcdef');
      expect(stroke(CLOUD_PATH_PREFIX)).toBe('#abcdef');
      expect(stroke('M3 12a9')).toBe('#303132');
      for (const status of ['online_syncing', 'online_uploading'] as const) {
        show('next', status);
        expect(stroke(CLOUD_PATH_PREFIX)).toBe('#101112');
        expect(stroke('M3 12a9')).toBe('#202122');
      }
      show('next', 'offline_synced');
      expect(stroke(CLOUD_PATH_PREFIX)).toBe('#404142');
      expect(stroke(CHECK_PATH)).toBe('#404142');
      show('next', 'offline_pending');
      expect(view.getByTestId('cloud-off-unsynced-glyph').props.color).toBe(
        '#404142',
      );
      show('next', 'offline_pending', '#abcdef');
      expect(view.getByTestId('cloud-off-unsynced-glyph').props.color).toBe(
        '#abcdef',
      );
      show('legacy', 'online_synced');
      expect(stroke(CLOUD_PATH_PREFIX)).toBe(legacy.colors.primaryForeground);
      expect(stroke(CHECK_PATH)).toBe(legacy.colors.syncStatusSynced);
      expect(
        view.getByLabelText(SYNC_STATUS_LABELS.online_synced),
      ).toBeTruthy();
    } finally {
      Object.assign(colors, original);
    }
  });
});
