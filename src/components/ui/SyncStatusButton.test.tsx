import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SyncStatusButton } from './SyncStatusButton';
import { getAllByHostType } from '../../test/hostElements';

jest.mock('../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

jest.mock('../../hooks/useHaptics', () => ({
  useHaptics: () => ({ press: jest.fn() }),
}));

// Each cloud icon renders a host view named for it, so the test can tell them apart.
jest.mock('./icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const icon = (name: string) => () =>
    React.createElement(View, { testID: `icon-${name}` });
  return {
    Cloud: icon('Cloud'),
    CloudArrowDown: icon('CloudArrowDown'),
    CloudArrowUp: icon('CloudArrowUp'),
    CloudCheck: icon('CloudCheck'),
    CloudSlash: icon('CloudSlash'),
    CloudWarning: icon('CloudWarning'),
  };
});

function iconName() {
  const icon = getAllByHostType('View').find(node =>
    String(node.props.testID ?? '').startsWith('icon-'),
  );
  return icon?.props.testID.slice('icon-'.length);
}

describe('SyncStatusButton', () => {
  it.each([
    ['online_synced', 'CloudCheck'],
    ['online_syncing', 'CloudArrowUp'],
    ['online_uploading', 'CloudArrowUp'],
    ['online_pending', 'CloudArrowUp'],
    ['online_needs_sync', 'CloudArrowDown'],
    ['online_failed', 'CloudWarning'],
    ['offline_synced', 'CloudSlash'],
    ['offline_pending', 'CloudSlash'],
  ] as const)('shows %s as %s', async (status, icon) => {
    await render(<SyncStatusButton status={status} onPress={jest.fn()} />);
    expect(iconName()).toBe(icon);
  });

  it('speaks the status, with the upload error when it failed', async () => {
    const onPress = jest.fn();
    await render(
      <SyncStatusButton
        status="online_failed"
        failedErrorText="Server busy."
        onPress={onPress}
      />,
    );

    const button = screen.getByRole('button', {
      name: 'Upload failed. Open Sync page to retry. Server busy.',
    });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("speaks only the status when it doesn't open the Sync page", async () => {
    await render(
      <SyncStatusButton
        status="online_failed"
        failedErrorText="Server busy."
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByLabelText('Upload failed. Server busy.')).toBeTruthy();
  });

  it('says pending uploads wait while drafting holds them', async () => {
    await render(
      <SyncStatusButton
        status="online_pending"
        heldForDrafting
        onPress={jest.fn()}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Online · uploads wait until you leave drafting. Open Sync page.',
      }),
    ).toBeTruthy();
    expect(iconName()).toBe('CloudArrowUp');
    expect(screen.getByText('Waiting')).toBeTruthy();
  });

  it.each(['online_synced', 'online_uploading', 'offline_pending'] as const)(
    'shows no visible word for %s even when drafting is open',
    async status => {
      await render(
        <SyncStatusButton
          status={status}
          heldForDrafting
          onPress={jest.fn()}
        />,
      );
      expect(screen.queryByText('Waiting')).toBeNull();
    },
  );
});
