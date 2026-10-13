import React from 'react';
import { render } from '@testing-library/react-native';
import { CloudSyncStatusIcon } from './CloudSyncStatusIcon';
import { SyncStatus, SYNC_STATUS_LABELS } from '../../utils/syncStatusState';
import { theme } from '../../theme';

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
  return (props: { accessibilityLabel?: string }) =>
    MockReact.createElement(View, {
      accessibilityLabel: props.accessibilityLabel,
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
  });

  it.each(ALL_STATUSES)('renders for status %s', status => {
    const { getByLabelText } = render(<CloudSyncStatusIcon status={status} />);

    expect(getByLabelText(SYNC_STATUS_LABELS[status])).toBeTruthy();
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
});
