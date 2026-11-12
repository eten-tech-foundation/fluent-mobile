import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SyncStatusButton } from './SyncStatusButton';

jest.mock('../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

jest.mock('../../hooks/useHaptics', () => ({
  useHaptics: () => ({ press: jest.fn() }),
}));

function iconName() {
  const icon = screen.UNSAFE_root.findAll(
    node =>
      typeof node.type === 'function' &&
      'displayName' in node.type &&
      String(node.type.displayName).startsWith('Cloud'),
  )[0];
  return (icon?.type as { displayName?: string } | undefined)?.displayName;
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
  ] as const)('shows %s as %s', (status, icon) => {
    render(<SyncStatusButton status={status} onPress={jest.fn()} />);
    expect(iconName()).toBe(icon);
  });

  it('speaks the status, with the upload error when it failed', () => {
    const onPress = jest.fn();
    render(
      <SyncStatusButton
        status="online_failed"
        failedErrorText="Server busy."
        onPress={onPress}
      />,
    );

    const button = screen.getByRole('button', {
      name: 'Upload failed. Open Sync page to retry. Server busy.',
    });
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("speaks only the status when it doesn't open the Sync page", () => {
    render(
      <SyncStatusButton
        status="online_failed"
        failedErrorText="Server busy."
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByLabelText('Upload failed. Server busy.')).toBeTruthy();
  });

  it('says pending uploads wait while drafting holds them', () => {
    render(
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
    status => {
      render(
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
