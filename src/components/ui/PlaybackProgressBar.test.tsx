import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PlaybackProgressBar, scrubPositionMs } from './PlaybackProgressBar';
import { theme } from '../../theme';

describe('scrubPositionMs', () => {
  it('maps x across the track to duration', () => {
    expect(scrubPositionMs(50, 100, 2000)).toBe(1000);
    expect(scrubPositionMs(0, 100, 2000)).toBe(0);
    expect(scrubPositionMs(100, 100, 2000)).toBe(2000);
  });

  it('clamps out-of-range touches', () => {
    expect(scrubPositionMs(-10, 100, 2000)).toBe(0);
    expect(scrubPositionMs(150, 100, 2000)).toBe(2000);
  });

  it('returns 0 when width or duration is invalid', () => {
    expect(scrubPositionMs(50, 0, 2000)).toBe(0);
    expect(scrubPositionMs(50, 100, 0)).toBe(0);
  });
});

describe('PlaybackProgressBar', () => {
  it('renders static progress bars by default', () => {
    render(
      <PlaybackProgressBar positionMs={500} durationMs={1000} barCount={8} />,
    );
    expect(screen.getByTestId('playback-progress')).toBeTruthy();
  });

  it('uses animated capture testID when animate+tall (live recording pulse)', () => {
    render(
      <PlaybackProgressBar
        positionMs={1200}
        durationMs={1200}
        barCount={12}
        tall
        animate
        accentColor={theme.colors.recordAccent}
      />,
    );
    expect(screen.getByTestId('playback-progress-animated')).toBeTruthy();
  });

  it('invokes onSeek from responder grant when scrubbing is enabled', () => {
    const onSeek = jest.fn();
    render(
      <PlaybackProgressBar
        positionMs={0}
        durationMs={2000}
        barCount={8}
        onSeek={onSeek}
      />,
    );
    const bar = screen.getByTestId('playback-progress');
    fireEvent(bar, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 28 } },
    });
    fireEvent(bar, 'responderGrant', {
      nativeEvent: { locationX: 50 },
    });
    expect(onSeek).toHaveBeenCalledWith(1000);
  });

  it('does not scrub while animate (capture) is on', () => {
    const onSeek = jest.fn();
    render(
      <PlaybackProgressBar
        positionMs={0}
        durationMs={2000}
        barCount={8}
        tall
        animate
        onSeek={onSeek}
      />,
    );
    const bar = screen.getByTestId('playback-progress-animated');
    fireEvent(bar, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 40 } },
    });
    fireEvent(bar, 'responderGrant', {
      nativeEvent: { locationX: 50 },
    });
    expect(onSeek).not.toHaveBeenCalled();
  });
});
