import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ManageDeviceStorageSection } from './ManageDeviceStorageSection';

const mockRequestDeleteSelected = jest.fn();
const mockToggleResourceSelected = jest.fn();
const mockToggleProjectExpanded = jest.fn();

jest.mock('../../hooks/usePrepareOfflineStorageManagement', () => ({
  usePrepareOfflineStorageManagement: jest.fn(),
}));

jest.mock('lucide-react-native', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockIcon = () => MockReact.createElement(View);
  return {
    ChevronDown: MockIcon,
    ChevronUp: MockIcon,
    Check: MockIcon,
    Trash2: MockIcon,
  };
});

const { usePrepareOfflineStorageManagement } = jest.requireMock(
  '../../hooks/usePrepareOfflineStorageManagement',
);

describe('ManageDeviceStorageSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    usePrepareOfflineStorageManagement.mockReturnValue({
      summary: {
        availableBytes: 12.4 * 1024 * 1024 * 1024,
        totalDeviceBytes: 64 * 1024 * 1024 * 1024,
        fluentUsedBytes: 1024 * 1024 * 1024,
      },
      groups: [
        {
          projectId: 2,
          projectName: 'Mark',
          totalBytes: 250,
          resources: [
            {
              id: 'resource-b',
              projectId: 2,
              label: 'Translation Notes — Text',
              resourceName: 'Translation Notes',
              kind: 'text',
              bytes: 250,
            },
          ],
        },
      ],
      initialLoaded: true,
      deleting: false,
      selectedIds: new Set<string>(),
      expandedProjectIds: new Set<number>(),
      bytesToFree: 0,
      hasSelection: false,
      toggleResourceSelected: mockToggleResourceSelected,
      toggleProjectExpanded: mockToggleProjectExpanded,
      requestDeleteSelected: mockRequestDeleteSelected,
    });
  });

  it('renders storage summary and empty-state copy when no other projects', () => {
    usePrepareOfflineStorageManagement.mockReturnValue({
      summary: {
        availableBytes: null,
        totalDeviceBytes: null,
        fluentUsedBytes: 0,
      },
      groups: [],
      initialLoaded: true,
      deleting: false,
      selectedIds: new Set(),
      expandedProjectIds: new Set(),
      bytesToFree: 0,
      hasSelection: false,
      toggleResourceSelected: mockToggleResourceSelected,
      toggleProjectExpanded: mockToggleProjectExpanded,
      requestDeleteSelected: mockRequestDeleteSelected,
    });

    render(<ManageDeviceStorageSection projectId={1} />);

    expect(screen.getByText('MANAGE DEVICE STORAGE')).toBeTruthy();
    expect(screen.getByText('Available on device')).toBeTruthy();
    expect(screen.getByText('Used by Fluent')).toBeTruthy();
    expect(screen.getByTestId('storage-available-bytes')).toHaveTextContent(
      '—',
    );
    expect(
      screen.getByTestId('storage-empty-other-projects'),
    ).toHaveTextContent('No resources from other projects on this device.');
  });

  it('disables delete selected when nothing is checked', () => {
    render(<ManageDeviceStorageSection projectId={1} />);

    expect(screen.getByText('Select items to delete')).toBeTruthy();

    const deleteButton = screen.getByTestId('storage-delete-selected-button');
    expect(deleteButton.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(deleteButton);
    expect(mockRequestDeleteSelected).not.toHaveBeenCalled();
  });

  it('shows live freed-space counter and enables delete when selected', () => {
    usePrepareOfflineStorageManagement.mockReturnValue({
      summary: {
        availableBytes: 12.4 * 1024 * 1024 * 1024,
        totalDeviceBytes: 64 * 1024 * 1024 * 1024,
        fluentUsedBytes: 1024 * 1024 * 1024,
      },
      groups: [
        {
          projectId: 2,
          projectName: 'Mark',
          totalBytes: 250,
          resources: [
            {
              id: 'resource-b',
              projectId: 2,
              label: 'Translation Notes — Text',
              resourceName: 'Translation Notes',
              kind: 'text',
              bytes: 250,
            },
          ],
        },
      ],
      initialLoaded: true,
      deleting: false,
      selectedIds: new Set(['resource-b']),
      expandedProjectIds: new Set([2]),
      bytesToFree: 250,
      hasSelection: true,
      toggleResourceSelected: mockToggleResourceSelected,
      toggleProjectExpanded: mockToggleProjectExpanded,
      requestDeleteSelected: mockRequestDeleteSelected,
    });

    render(<ManageDeviceStorageSection projectId={1} />);

    expect(screen.getByTestId('storage-bytes-to-free')).toHaveTextContent(
      '250 B to free',
    );
    expect(screen.getByText('Delete Selected')).toBeTruthy();

    const deleteButton = screen.getByTestId('storage-delete-selected-button');
    expect(deleteButton.props.accessibilityState?.disabled).toBe(false);
    fireEvent.press(deleteButton);
    expect(mockRequestDeleteSelected).toHaveBeenCalledTimes(1);
  });

  it('disables delete selected while a download is in progress', () => {
    usePrepareOfflineStorageManagement.mockReturnValue({
      summary: {
        availableBytes: 12.4 * 1024 * 1024 * 1024,
        totalDeviceBytes: 64 * 1024 * 1024 * 1024,
        fluentUsedBytes: 1024 * 1024 * 1024,
      },
      groups: [
        {
          projectId: 2,
          projectName: 'Mark',
          totalBytes: 250,
          resources: [
            {
              id: 'resource-b',
              projectId: 2,
              label: 'Translation Notes — Text',
              resourceName: 'Translation Notes',
              kind: 'text',
              bytes: 250,
            },
          ],
        },
      ],
      initialLoaded: true,
      deleting: false,
      selectedIds: new Set(['resource-b']),
      expandedProjectIds: new Set([2]),
      bytesToFree: 250,
      hasSelection: true,
      toggleResourceSelected: mockToggleResourceSelected,
      toggleProjectExpanded: mockToggleProjectExpanded,
      requestDeleteSelected: mockRequestDeleteSelected,
    });

    render(
      <ManageDeviceStorageSection projectId={1} downloadInProgress={true} />,
    );

    const deleteButton = screen.getByTestId('storage-delete-selected-button');
    expect(deleteButton.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(deleteButton);
    expect(mockRequestDeleteSelected).not.toHaveBeenCalled();
  });

  it('renders formatted summary values when storage is available', () => {
    render(<ManageDeviceStorageSection projectId={1} />);

    expect(screen.getByTestId('storage-available-bytes')).toHaveTextContent(
      '12.4 GB of 64 GB',
    );
    expect(screen.getByTestId('storage-fluent-used-bytes')).toHaveTextContent(
      '1 GB',
    );
    expect(screen.getByTestId('storage-project-2')).toBeTruthy();
    expect(screen.getByText('Mark')).toBeTruthy();
  });

  it('expands a project accordion when the header is pressed', () => {
    render(<ManageDeviceStorageSection projectId={1} />);

    fireEvent.press(screen.getByText('Mark'));
    expect(mockToggleProjectExpanded).toHaveBeenCalledWith(2);
  });

  it('toggles resource selection when an expanded row is pressed', () => {
    usePrepareOfflineStorageManagement.mockReturnValue({
      summary: {
        availableBytes: 12.4 * 1024 * 1024 * 1024,
        totalDeviceBytes: 64 * 1024 * 1024 * 1024,
        fluentUsedBytes: 1024 * 1024 * 1024,
      },
      groups: [
        {
          projectId: 2,
          projectName: 'Mark',
          totalBytes: 250,
          resources: [
            {
              id: 'resource-b',
              projectId: 2,
              label: 'Translation Notes — Text',
              resourceName: 'Translation Notes',
              kind: 'text',
              bytes: 250,
            },
          ],
        },
      ],
      initialLoaded: true,
      deleting: false,
      selectedIds: new Set<string>(),
      expandedProjectIds: new Set([2]),
      bytesToFree: 0,
      hasSelection: false,
      toggleResourceSelected: mockToggleResourceSelected,
      toggleProjectExpanded: mockToggleProjectExpanded,
      requestDeleteSelected: mockRequestDeleteSelected,
    });

    render(<ManageDeviceStorageSection projectId={1} />);

    fireEvent.press(screen.getByTestId('storage-resource-row-resource-b'));
    expect(mockToggleResourceSelected).toHaveBeenCalledWith('resource-b');
  });

  it('disables delete selected while deletion is in progress', () => {
    usePrepareOfflineStorageManagement.mockReturnValue({
      summary: {
        availableBytes: 12.4 * 1024 * 1024 * 1024,
        totalDeviceBytes: 64 * 1024 * 1024 * 1024,
        fluentUsedBytes: 1024 * 1024 * 1024,
      },
      groups: [
        {
          projectId: 2,
          projectName: 'Mark',
          totalBytes: 250,
          resources: [
            {
              id: 'resource-b',
              projectId: 2,
              label: 'Translation Notes — Text',
              resourceName: 'Translation Notes',
              kind: 'text',
              bytes: 250,
            },
          ],
        },
      ],
      initialLoaded: true,
      deleting: true,
      selectedIds: new Set(['resource-b']),
      expandedProjectIds: new Set([2]),
      bytesToFree: 250,
      hasSelection: true,
      toggleResourceSelected: mockToggleResourceSelected,
      toggleProjectExpanded: mockToggleProjectExpanded,
      requestDeleteSelected: mockRequestDeleteSelected,
    });

    render(<ManageDeviceStorageSection projectId={1} />);

    expect(screen.queryByTestId('storage-delete-spinner')).toBeNull();
    expect(screen.getByTestId('storage-delete-selected-button')).toHaveProp(
      'accessibilityState',
      { disabled: true },
    );
  });
});
