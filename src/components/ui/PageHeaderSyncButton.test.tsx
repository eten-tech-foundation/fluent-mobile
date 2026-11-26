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
  it('renders sync status label and calls onPress when pressed', async () => {
    const onPress = jest.fn();

    await render(
      <PageHeaderSyncButton syncStatus="online_synced" onPress={onPress} />,
    );

    expect(screen.getByTestId('home-sync-button')).toBeTruthy();
    expect(
      screen.getByLabelText('Online · all synced. Open Sync page.'),
    ).toBeTruthy();

    await fireEvent.press(screen.getByTestId('home-sync-button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('forwards onPressIn for mid-tap diagnostics (#721)', async () => {
    const onPress = jest.fn();
    const onPressIn = jest.fn();

    await render(
      <PageHeaderSyncButton
        syncStatus="online_synced"
        onPress={onPress}
        onPressIn={onPressIn}
      />,
    );

    await fireEvent(screen.getByTestId('home-sync-button'), 'pressIn');
    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('includes sanitized failure reason in the a11y label when uploads failed', async () => {
    await render(
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
