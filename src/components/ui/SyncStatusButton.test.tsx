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
});
