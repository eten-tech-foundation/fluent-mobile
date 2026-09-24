import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PageHeaderSyncButton } from './PageHeaderSyncButton';

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

describe('PageHeaderSyncButton', () => {
  it('renders sync status label and calls onPress when pressed', () => {
    const onPress = jest.fn();

    render(
      <PageHeaderSyncButton syncStatus="online_synced" onPress={onPress} />,
    );

    expect(screen.getByTestId('home-sync-button')).toBeTruthy();
    expect(
      screen.getByLabelText('Online · all synced. Open Sync page.'),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('home-sync-button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('includes sanitized failure reason in the a11y label when uploads failed', () => {
    render(
      <PageHeaderSyncButton
        syncStatus="online_failed"
        failedErrorText="Audio storage is currently unavailable. Try again later."
        onPress={jest.fn()}
      />,
    );

    expect(
      screen.getByLabelText(
        'Upload failed. Open Sync page to retry. Audio storage is currently unavailable. Try again later.',
      ),
    ).toBeTruthy();
  });
});
