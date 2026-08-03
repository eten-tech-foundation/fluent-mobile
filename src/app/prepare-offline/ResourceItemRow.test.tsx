import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ResourceItemRow } from './ResourceItemRow';
import { PrepareOfflineResourceItem } from '../../types/prepareOffline/types';

jest.mock('lucide-react-native', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockIcon = ({ testID }: { testID?: string }) =>
    MockReact.createElement(View, { testID });
  return {
    CircleCheck: (props: { testID?: string }) =>
      MockReact.createElement(View, {
        testID: props.testID ?? 'resource-status-completed',
      }),
    Download: (props: { testID?: string }) =>
      MockReact.createElement(View, { testID: props.testID }),
    Lock: () =>
      MockReact.createElement(View, { testID: 'resource-customize-tier-lock' }),
    Check: MockIcon,
  };
});

const baseItem: PrepareOfflineResourceItem = {
  id: 'tier-1-source-bible-text',
  tier: 1,
  kind: 'text',
  groupName: 'Source Bible',
  label: 'Text',
  bytes: 8 * 1024 * 1024,
  status: 'completed',
};

describe('ResourceItemRow', () => {
  it('shows completed status icon before the label in summary mode', () => {
    render(<ResourceItemRow item={baseItem} mode="summary" />);

    expect(screen.getByTestId('resource-status-completed')).toBeTruthy();
    expect(screen.getByText('Text')).toBeTruthy();
    expect(screen.getByText('8 MB')).toBeTruthy();
  });

  it('shows pending download icon before the label for selected items', () => {
    render(
      <ResourceItemRow
        item={{ ...baseItem, tier: 3, status: 'selected' }}
        mode="summary"
      />,
    );

    expect(screen.getByTestId('resource-status-pending')).toBeTruthy();
  });

  it('shows downloading status icon before the label in summary mode', () => {
    render(
      <ResourceItemRow
        item={{ ...baseItem, status: 'downloading' }}
        mode="summary"
      />,
    );

    expect(screen.getByTestId('resource-status-downloading')).toBeTruthy();
  });

  it('shows tier lock in customize for required tier 1 rows', () => {
    render(
      <ResourceItemRow
        item={baseItem}
        mode="customize"
        locked
        showTierLock
        selected
      />,
    );

    expect(screen.getByTestId('resource-customize-tier-lock')).toBeTruthy();
  });

  it('shows green check for on-device tier 2/3 rows in customize', () => {
    render(
      <ResourceItemRow
        item={{ ...baseItem, tier: 2 }}
        mode="customize"
        locked
        showTierLock={false}
        selected
      />,
    );

    expect(
      screen.getByTestId('resource-customize-on-device-check'),
    ).toBeTruthy();
    expect(screen.queryByTestId('resource-customize-tier-lock')).toBeNull();
  });

  it('keeps downloading tier 2/3 rows editable in customize', () => {
    render(
      <ResourceItemRow
        item={{
          ...baseItem,
          id: 'tier-2-translation-words-audio',
          tier: 2,
          kind: 'audio',
          groupName: 'Translation Words',
          label: 'Audio',
          status: 'downloading',
        }}
        mode="customize"
        locked={false}
        showTierLock={false}
        selected
        onToggle={jest.fn()}
      />,
    );

    expect(
      screen.queryByTestId('resource-customize-on-device-check'),
    ).toBeNull();
    expect(
      screen.getByTestId('resource-row-tier-2-translation-words-audio'),
    ).toBeTruthy();
  });
});
