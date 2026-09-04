import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SourceAudioPlayerBar } from './SourceAudioPlayerBar';

describe('SourceAudioPlayerBar', () => {
  it('renders empty state as a minimal message bar', () => {
    render(
      <SourceAudioPlayerBar
        sourceLabel="BSB"
        unitLabel="Verse 1 / 2"
        loadState="empty"
        positionMs={0}
        durationMs={0}
        isPlaying={false}
        onTogglePlay={jest.fn()}
        onSeek={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByTestId('source-audio-label')).toHaveTextContent(
      'No source audio',
    );
    expect(screen.queryByTestId('source-audio-play')).toBeNull();
    expect(screen.queryByTestId('source-audio-waveform')).toBeNull();
    expect(screen.queryByTestId('source-audio-time-elapsed')).toBeNull();
  });

  it('renders loading state with a centered spinner and footer label', () => {
    render(
      <SourceAudioPlayerBar
        sourceLabel="BSB"
        unitLabel="Verse 1 / 2"
        loadState="loading"
        positionMs={0}
        durationMs={0}
        isPlaying={false}
        onTogglePlay={jest.fn()}
        onSeek={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByTestId('source-audio-loading')).toBeTruthy();
    expect(screen.getByTestId('source-audio-label')).toHaveTextContent(
      'Loading source audio...',
    );
    expect(screen.queryByTestId('source-audio-play')).toBeNull();
    expect(screen.queryByTestId('source-audio-waveform')).toBeNull();
    expect(screen.queryByTestId('source-audio-time-elapsed')).toBeNull();
  });

  it('renders ready state with waveform, timers, and a single footer label', () => {
    const onTogglePlay = jest.fn();
    render(
      <SourceAudioPlayerBar
        sourceLabel="BSB"
        unitLabel="Verse 2 / 72"
        loadState="ready"
        positionMs={16000}
        durationMs={631000}
        isPlaying={false}
        onTogglePlay={onTogglePlay}
        onSeek={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByTestId('source-audio-label')).toHaveTextContent(
      'BSB Source Audio · Verse 2 / 72',
    );
    expect(screen.queryByTestId('source-audio-unit-counter')).toBeNull();
    expect(screen.getByTestId('source-audio-time-elapsed')).toHaveTextContent(
      '0:16',
    );
    expect(screen.getByTestId('source-audio-time-duration')).toHaveTextContent(
      '10:31',
    );

    fireEvent.press(screen.getByTestId('source-audio-play'));
    expect(onTogglePlay).toHaveBeenCalled();
  });
});
