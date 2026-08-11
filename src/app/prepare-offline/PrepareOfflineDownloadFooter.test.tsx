import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PrepareOfflineDownloadFooter } from './PrepareOfflineDownloadFooter';

jest.mock('lucide-react-native', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockIcon = () => MockReact.createElement(View);
  return {
    CircleCheck: MockIcon,
    Download: MockIcon,
    Pause: MockIcon,
    Play: MockIcon,
    X: MockIcon,
  };
});

describe('PrepareOfflineDownloadFooter', () => {
  const defaultProps = {
    totalBytes: 338 * 1024 * 1024,
    canDownload: true,
    downloadButtonLabel: 'Download 164 MB',
    session: 'idle' as const,
    onDownload: jest.fn(),
    onPause: jest.fn(),
    onResume: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates total row and download label in idle session', () => {
    render(
      <PrepareOfflineDownloadFooter
        {...defaultProps}
        totalBytes={204 * 1024 * 1024}
        downloadButtonLabel="Download 18 MB"
      />,
    );

    expect(screen.getByTestId('prepare-offline-total-bytes')).toHaveTextContent(
      '204 MB',
    );
    expect(
      screen.getByTestId('prepare-offline-download-button'),
    ).toHaveTextContent('Download 18 MB');
  });

  it('calls onDownload when the download button is pressed', () => {
    const onDownload = jest.fn();
    render(
      <PrepareOfflineDownloadFooter
        {...defaultProps}
        onDownload={onDownload}
      />,
    );

    fireEvent.press(screen.getByTestId('prepare-offline-download-button'));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('does not call onDownload when the download button is disabled', () => {
    const onDownload = jest.fn();
    render(
      <PrepareOfflineDownloadFooter
        {...defaultProps}
        canDownload={false}
        onDownload={onDownload}
      />,
    );

    const button = screen.getByTestId('prepare-offline-download-button');
    expect(button.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(button);
    expect(onDownload).not.toHaveBeenCalled();
  });

  it('shows pause and cancel controls while downloading', () => {
    render(
      <PrepareOfflineDownloadFooter {...defaultProps} session="downloading" />,
    );

    expect(
      screen.getByTestId('prepare-offline-download-controls-downloading'),
    ).toBeTruthy();
    expect(screen.getByTestId('prepare-offline-download-pause')).toBeTruthy();
    expect(screen.getByTestId('prepare-offline-download-cancel')).toBeTruthy();
    expect(screen.queryByTestId('prepare-offline-download-button')).toBeNull();
    expect(screen.getByTestId('prepare-offline-total-bytes')).toHaveTextContent(
      '338 MB',
    );
    expect(screen.queryByTestId('prepare-offline-remaining-bytes')).toBeNull();
  });

  it('shows resume and cancel controls while paused', () => {
    render(<PrepareOfflineDownloadFooter {...defaultProps} session="paused" />);

    expect(
      screen.getByTestId('prepare-offline-download-controls-paused'),
    ).toBeTruthy();
    expect(screen.getByTestId('prepare-offline-download-resume')).toBeTruthy();
    expect(screen.getByTestId('prepare-offline-download-cancel')).toBeTruthy();
  });

  it('disables controls while busy', () => {
    render(
      <PrepareOfflineDownloadFooter
        {...defaultProps}
        session="downloading"
        busy
      />,
    );

    expect(
      screen.getByTestId('prepare-offline-download-pause').props
        .accessibilityState?.disabled,
    ).toBe(true);
  });

  it('shows complete feedback when session is complete', () => {
    render(
      <PrepareOfflineDownloadFooter {...defaultProps} session="complete" />,
    );

    expect(
      screen.getByTestId('prepare-offline-download-complete'),
    ).toBeTruthy();
    expect(screen.getByText('Download complete')).toBeTruthy();
    expect(screen.queryByTestId('prepare-offline-download-button')).toBeNull();
  });
});
