import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TopBarSyncButton } from './TopBarSyncButton';

jest.mock('lucide-react-native', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockIcon = () => MockReact.createElement(View);
  return {
    ArrowUp: MockIcon,
    Check: MockIcon,
    Cloud: MockIcon,
    CloudOff: MockIcon,
    RefreshCw: MockIcon,
  };
});

jest.mock('./CloudSyncStatusIcon', () => ({
  CloudSyncStatusIcon: () => {
    const MockReact = require('react');
    const { View } = require('react-native');
    return MockReact.createElement(View);
  },
}));

describe('TopBarSyncButton', () => {
  it('renders sync status label and calls onPress when pressed', () => {
    const onPress = jest.fn();

    render(
      <TopBarSyncButton syncStatus="online_synced" onPress={onPress} />,
    );

    expect(screen.getByLabelText('Synced. Open Sync page.')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Synced. Open Sync page.'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
