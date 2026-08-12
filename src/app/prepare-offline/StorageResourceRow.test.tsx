import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StorageResourceRow } from './StorageResourceRow';

jest.mock('lucide-react-native', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockIcon = () => MockReact.createElement(View);
  return { Check: MockIcon };
});

const resource = {
  id: 'resource-b',
  projectId: 2,
  label: 'Source Bible — Audio',
  resourceName: 'Source Bible',
  kind: 'audio' as const,
  bytes: 125 * 1024 * 1024,
};

describe('StorageResourceRow', () => {
  it('shows kind label and formatted size', () => {
    render(
      <StorageResourceRow
        resource={resource}
        selected={false}
        onToggle={jest.fn()}
      />,
    );

    expect(screen.getByText('Audio')).toBeTruthy();
    expect(screen.getByText('125 MB')).toBeTruthy();
  });

  it('calls onToggle when pressed', () => {
    const onToggle = jest.fn();

    render(
      <StorageResourceRow
        resource={resource}
        selected={false}
        onToggle={onToggle}
      />,
    );

    fireEvent.press(screen.getByTestId('storage-resource-row-resource-b'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('reflects selected accessibility state', () => {
    render(
      <StorageResourceRow
        resource={resource}
        selected={true}
        onToggle={jest.fn()}
      />,
    );

    expect(screen.getByTestId('storage-resource-row-resource-b')).toHaveProp(
      'accessibilityState',
      { checked: true },
    );
  });
});
