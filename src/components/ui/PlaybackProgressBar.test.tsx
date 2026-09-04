import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  PlaybackProgressBar,
  fittedBarCount,
  scrubPositionMs,
  stableTrackWidth,
} from './PlaybackProgressBar';
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

describe('fittedBarCount', () => {
  it('renders no bars before the row is measured', () => {
    // Pre-measure 24-bar paint inflated intrinsic width and oscillated with the
    // flex parent on device (#298). Stay empty until onLayout.
    expect(fittedBarCount(24, 0, 3, 3)).toBe(0);
  });

  it('keeps the requested count when the row is wide enough', () => {
    expect(fittedBarCount(24, 200, 3, 3)).toBe(24);
  });

  it('drops bars that would not fit the measured width', () => {
    // 24 bars need 24*3 + 23*3 = 141px; a take-row waveform gets far less.
    expect(fittedBarCount(24, 60, 3, 3)).toBe(10);
  });

  it('never collapses below a readable floor', () => {
    expect(fittedBarCount(24, 8, 3, 3)).toBe(6);
  });
});

describe('stableTrackWidth', () => {
  it('accepts the first real measurement', () => {
    expect(stableTrackWidth(0, 60)).toBe(60);
  });

  it('ignores equal widths', () => {
    expect(stableTrackWidth(60, 60)).toBe(60);
  });

  it('ignores ±1–2px Yoga jitter that previously looped onLayout (#298)', () => {
    expect(stableTrackWidth(60, 58)).toBe(60);
    expect(stableTrackWidth(60, 62)).toBe(60);
    expect(stableTrackWidth(60, 59)).toBe(60);
  });

  it('accepts a real resize beyond the stability window', () => {
    expect(stableTrackWidth(60, 80)).toBe(80);
    expect(stableTrackWidth(60, 40)).toBe(40);
  });
});

describe('PlaybackProgressBar', () => {
  it('renders a playhead when showPlayhead is set', () => {
    // fireEvent.layout only reaches onLayout when the row is seekable (RNTL);
    // the source-audio dock always passes onSeek when ready.
    render(
      <PlaybackProgressBar
        positionMs={500}
        durationMs={1000}
        barCount={8}
        showPlayhead
        onSeek={() => undefined}
      />,
    );
    const bar = screen.getByTestId('playback-progress');
    fireEvent(bar, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 36 } },
    });
    expect(screen.getByTestId('playback-progress-playhead')).toBeTruthy();
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

  it('survives alternating near-equal onLayout widths without throwing', () => {
    // Repro sketch for #298: content-vs-constraint measure jitter used to
    // setState → layout → setState until Maximum update depth exceeded.
    render(
      <PlaybackProgressBar positionMs={0} durationMs={2000} barCount={24} />,
    );
    const bar = screen.getByTestId('playback-progress');
    for (let i = 0; i < 40; i += 1) {
      const width = i % 2 === 0 ? 60 : 58;
      fireEvent(bar, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width, height: 28 } },
      });
    }
    expect(screen.getByTestId('playback-progress')).toBeTruthy();
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

  it('samples seeks while dragging and always seeks the released position', () => {
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
    fireEvent(bar, 'responderGrant', { nativeEvent: { locationX: 10 } });
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenLastCalledWith(200);

    // A device drag emits a move per touch frame — those must not each become
    // a native seek.
    for (let x = 20; x <= 80; x += 10) {
      fireEvent(bar, 'responderMove', { nativeEvent: { locationX: x } });
    }
    expect(onSeek).toHaveBeenCalledTimes(1);

    fireEvent(bar, 'responderRelease', { nativeEvent: { locationX: 80 } });
    expect(onSeek).toHaveBeenCalledTimes(2);
    expect(onSeek).toHaveBeenLastCalledWith(1600);
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
