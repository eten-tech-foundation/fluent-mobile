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
  };
});

describe('PrepareOfflineDownloadFooter', () => {
  const defaultProps = {
    totalBytes: 338 * 1024 * 1024,
    pendingBytes: 164 * 1024 * 1024,
    canDownload: true,
    downloadButtonLabel: 'Download 164 MB',
    downloadStarted: false,
    onDownload: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates total row and download label', () => {
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

  it('shows started placeholder after download begins', () => {
    render(
      <PrepareOfflineDownloadFooter
        {...defaultProps}
        downloadStarted
        pendingBytes={164 * 1024 * 1024}
      />,
    );

    expect(screen.getByTestId('prepare-offline-download-started')).toBeTruthy();
    expect(
      screen.getByText(
        'Download started. Pause, resume, and cancel controls are coming soon.',
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('prepare-offline-download-button')).toBeNull();
    expect(
      screen.queryByTestId('prepare-offline-download-complete'),
    ).toBeNull();
  });

  it('shows complete feedback when the simulated download finishes', () => {
    render(
      <PrepareOfflineDownloadFooter
        {...defaultProps}
        downloadStarted
        pendingBytes={0}
      />,
    );

    expect(
      screen.getByTestId('prepare-offline-download-complete'),
    ).toBeTruthy();
    expect(screen.getByText('Download complete')).toBeTruthy();
    expect(screen.queryByTestId('prepare-offline-download-started')).toBeNull();
    expect(screen.queryByTestId('prepare-offline-download-button')).toBeNull();
  });
});
