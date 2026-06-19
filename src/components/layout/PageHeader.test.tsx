import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PageHeader } from './PageHeader';

jest.mock('lucide-react-native', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockIcon = () => MockReact.createElement(View);
  return {
    Settings: MockIcon,
    ChevronLeft: MockIcon,
    ArrowUp: MockIcon,
    Check: MockIcon,
    Cloud: MockIcon,
    CloudOff: MockIcon,
    RefreshCw: MockIcon,
  };
});

jest.mock('../ui/CloudSyncStatusIcon', () => ({
  CloudSyncStatusIcon: () => {
    const MockReact = require('react');
    const { View } = require('react-native');
    return MockReact.createElement(View);
  },
}));

jest.mock('../../assets/icons/fluent-logo-white.svg', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return () => MockReact.createElement(View);
});

describe('PageHeader', () => {
  it('renders sync status icon and navigates on press', () => {
    const onSyncPress = jest.fn();

    render(<PageHeader syncStatus="online_synced" onSyncPress={onSyncPress} />);

    expect(screen.getByLabelText('Synced. Open Sync page.')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Synced. Open Sync page.'));
    expect(onSyncPress).toHaveBeenCalledTimes(1);
  });

  it('navigates to settings when the settings icon is pressed', () => {
    const onSettingsPress = jest.fn();

    render(
      <PageHeader
        syncStatus="online_synced"
        onSettingsPress={onSettingsPress}
      />,
    );

    fireEvent.press(screen.getByLabelText('Settings'));
    expect(onSettingsPress).toHaveBeenCalledTimes(1);
  });

  it('calls onBackPress when the back button is pressed', () => {
    const onBackPress = jest.fn();

    render(<PageHeader title="Settings" onBackPress={onBackPress} />);

    fireEvent.press(screen.getByLabelText('Go back'));
    expect(onBackPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Settings')).toBeTruthy();
  });
});
