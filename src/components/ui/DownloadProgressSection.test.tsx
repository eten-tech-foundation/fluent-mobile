import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('../../services/storage', () => ({
  getActiveUserId: () => '',
  setPrepareOfflineDownloadStarted: jest.fn(),
}));

jest.mock('../../db/repository', () => ({
  getDownloadQueueSnapshot: jest.fn().mockResolvedValue({
    items: [],
    completedCount: 0,
    totalCount: 0,
    aggregateProgress: 0,
  }),
}));

jest.mock('../../services/downloadQueueWorker', () => ({
  DownloadQueueWorker: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    cancel: jest.fn(),
    getState: jest.fn().mockReturnValue('idle'),
  })),
}));

import { DownloadProgressSection } from './DownloadProgressSection';
import type { DownloadQueueSnapshot } from '../../types/download/types';
import { EMPTY_DOWNLOAD_SNAPSHOT } from '../../hooks/useDownloadQueue';

const fixtureSnapshot: DownloadQueueSnapshot = {
  items: [
    {
      id: '1',
      tier: 1,
      label: 'Source Bible',
      progress: 0.81,
      status: 'downloading',
      projectId: 1,
    },
    {
      id: '2',
      tier: 1,
      label: 'Source Bible',
      progress: 0,
      status: 'queued',
      projectId: 1,
    },
    {
      id: '3',
      tier: 2,
      label: 'Translation Notes — Mark',
      progress: 0,
      status: 'queued',
    },
    {
      id: '4',
      tier: 2,
      label: 'Translation Words — Luke',
      progress: 0,
      status: 'queued',
    },
  ],
  completedCount: 0,
  totalCount: 4,
  aggregateProgress: 0.2,
  primaryProjectId: 1,
};

describe('DownloadProgressSection', () => {
  const onManageDownloads = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('renders nothing when the queue is empty', () => {
    const { queryByTestId } = render(
      <DownloadProgressSection
        snapshot={EMPTY_DOWNLOAD_SNAPSHOT}
        onManageDownloads={onManageDownloads}
      />,
    );

    expect(queryByTestId('download-progress-section')).toBeNull();
  });

  it('shows header, count, and row labels for active items', () => {
    const { getByText, getByTestId, getAllByText } = render(
      <DownloadProgressSection
        snapshot={fixtureSnapshot}
        onManageDownloads={onManageDownloads}
      />,
    );

    expect(getByTestId('download-progress-section')).toBeTruthy();
    expect(getByText('Downloads')).toBeTruthy();
    expect(getByText('4 items remaining')).toBeTruthy();
    expect(getAllByText('Source Bible')).toHaveLength(2);
    expect(getByText('Translation Notes — Mark')).toBeTruthy();
    expect(getByText('Translation Words — Luke')).toBeTruthy();
    expect(getByText('81%')).toBeTruthy();
    expect(getAllByText('0%')).toHaveLength(3);
  });

  it('calls onManageDownloads when manage row is pressed', () => {
    const { getByTestId } = render(
      <DownloadProgressSection
        snapshot={fixtureSnapshot}
        onManageDownloads={onManageDownloads}
      />,
    );

    fireEvent.press(getByTestId('download-manage-press'));
    expect(onManageDownloads).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when every item is completed', () => {
    const allCompletedSnapshot: DownloadQueueSnapshot = {
      items: [
        {
          id: '1',
          tier: 1,
          label: 'Source Bible',
          progress: 1,
          status: 'completed',
          projectId: 1,
        },
        {
          id: '2',
          tier: 2,
          label: 'Translation Notes — Mark',
          progress: 1,
          status: 'completed',
        },
      ],
      completedCount: 2,
      totalCount: 2,
      aggregateProgress: 1,
      primaryProjectId: 1,
    };

    const { queryByTestId } = render(
      <DownloadProgressSection
        snapshot={allCompletedSnapshot}
        onManageDownloads={onManageDownloads}
      />,
    );

    expect(queryByTestId('download-progress-section')).toBeNull();
  });

  it('shows remaining count from totalCount minus completedCount', () => {
    const partialSnapshot: DownloadQueueSnapshot = {
      items: [
        {
          id: '1',
          tier: 1,
          label: 'Source Bible',
          progress: 1,
          status: 'completed',
          projectId: 1,
        },
        {
          id: '2',
          tier: 1,
          label: 'Source Bible',
          progress: 0.67,
          status: 'downloading',
          projectId: 1,
        },
      ],
      completedCount: 1,
      totalCount: 5,
      aggregateProgress: 0.55,
      primaryProjectId: 1,
    };

    const { getByText } = render(
      <DownloadProgressSection
        snapshot={partialSnapshot}
        onManageDownloads={onManageDownloads}
      />,
    );

    expect(getByText('4 items remaining')).toBeTruthy();
    expect(getByText('67%')).toBeTruthy();
  });

  it('lists failed items as active rows', () => {
    const failedSnapshot: DownloadQueueSnapshot = {
      items: [
        {
          id: '1',
          tier: 2,
          label: 'Matthew — Audio',
          progress: 0.42,
          status: 'failed',
        },
      ],
      completedCount: 0,
      totalCount: 1,
      aggregateProgress: 0.42,
    };

    const { getByText, getByTestId } = render(
      <DownloadProgressSection
        snapshot={failedSnapshot}
        onManageDownloads={onManageDownloads}
      />,
    );

    expect(getByTestId('download-progress-section')).toBeTruthy();
    expect(getByText('Matthew — Audio')).toBeTruthy();
    expect(getByText('42%')).toBeTruthy();
    expect(getByText('1 item remaining')).toBeTruthy();
  });
});
