import React from 'react';
import { render } from '@testing-library/react-native';
import { CloudSyncStatusIcon } from './CloudSyncStatusIcon';
import { SyncStatus } from '../../utils/syncStatusState';

jest.mock('react-native-svg', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockSvg = (props: { accessibilityLabel?: string }) =>
    MockReact.createElement(View, {
      accessibilityLabel: props.accessibilityLabel,
    });

  return {
    __esModule: true,
    default: MockSvg,
    Path: MockSvg,
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
  'online_pending',
  'offline_synced',
  'offline_pending',
];

describe('CloudSyncStatusIcon', () => {
  it.each(ALL_STATUSES)('renders for status %s', status => {
    const { getByLabelText } = render(<CloudSyncStatusIcon status={status} />);

    expect(getByLabelText(/Open Sync page/i)).toBeTruthy();
  });
});
