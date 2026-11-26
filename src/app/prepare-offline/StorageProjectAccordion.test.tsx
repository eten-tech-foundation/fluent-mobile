import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StorageProjectAccordion } from './StorageProjectAccordion';

jest.mock('lucide-react-native', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockIcon = () => MockReact.createElement(View);
  return {
    ChevronDown: MockIcon,
    ChevronUp: MockIcon,
    Check: MockIcon,
  };
});

const group = {
  projectId: 2,
  projectName: 'Mark',
  totalBytes: 132,
  resources: [
    {
      id: 'text-id',
      projectId: 2,
      label: 'Source Bible — Text',
      resourceName: 'Source Bible',
      kind: 'text' as const,
      bytes: 7,
    },
    {
      id: 'audio-id',
      projectId: 2,
      label: 'Source Bible — Audio',
      resourceName: 'Source Bible',
      kind: 'audio' as const,
      bytes: 125,
    },
  ],
};

describe('StorageProjectAccordion', () => {
  it('shows project name and total while collapsed', async () => {
    await render(
      <StorageProjectAccordion
        group={group}
        expanded={false}
        selectedIds={new Set()}
        onToggleExpanded={jest.fn()}
        onToggleResource={jest.fn()}
      />,
    );

    expect(screen.getByText('Mark')).toBeTruthy();
    expect(screen.getByText('132 B')).toBeTruthy();
    expect(screen.queryByText('Source Bible')).toBeNull();
  });

  it('shows grouped resources when expanded', async () => {
    await render(
      <StorageProjectAccordion
        group={group}
        expanded={true}
        selectedIds={new Set(['audio-id'])}
        onToggleExpanded={jest.fn()}
        onToggleResource={jest.fn()}
      />,
    );

    expect(screen.getByText('Source Bible')).toBeTruthy();
    expect(screen.getByText('Text')).toBeTruthy();
    expect(screen.getByText('Audio')).toBeTruthy();
    expect(screen.getByTestId('storage-resource-row-audio-id')).toHaveProp(
      'accessibilityState',
      { checked: true },
    );
  });

  it('calls onToggleExpanded when header is pressed', async () => {
    const onToggleExpanded = jest.fn();

    await render(
      <StorageProjectAccordion
        group={group}
        expanded={false}
        selectedIds={new Set()}
        onToggleExpanded={onToggleExpanded}
        onToggleResource={jest.fn()}
      />,
    );

    await fireEvent.press(screen.getByText('Mark'));
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleResource when a row is pressed', async () => {
    const onToggleResource = jest.fn();

    await render(
      <StorageProjectAccordion
        group={group}
        expanded={true}
        selectedIds={new Set()}
        onToggleExpanded={jest.fn()}
        onToggleResource={onToggleResource}
      />,
    );

    await fireEvent.press(screen.getByTestId('storage-resource-row-text-id'));
    expect(onToggleResource).toHaveBeenCalledWith('text-id');
  });
});
