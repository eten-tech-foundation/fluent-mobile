import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { RecordingWaveform } from './RecordingWaveform';
import { RecorderStatus } from '../../../../../types/recording/types';

// The filled/unfilled bar styles are visually distinguished by opacity
// (0.95 vs 0.3); walk the rendered JSON tree to count filled bars without
// depending on internal state.
function countFilledBars(node: unknown): number {
  if (!node) return 0;
  if (Array.isArray(node)) {
    return node.reduce((sum: number, child) => sum + countFilledBars(child), 0);
  }
  const element = node as { props?: { style?: unknown }; children?: unknown };
  const style = element.props?.style;
  const styleArr = Array.isArray(style) ? style : style ? [style] : [];
  const isFilled = styleArr.some(
    s =>
      typeof s === 'object' &&
      s !== null &&
      (s as { opacity?: number }).opacity === 0.95,
  );
  return (isFilled ? 1 : 0) + countFilledBars(element.children);
}

describe('RecordingWaveform', () => {
  it('renders nothing for idle status', () => {
    render(<RecordingWaveform status={RecorderStatus.Idle} elapsedMs={0} />);

    expect(screen.queryByTestId('record-waveform-live')).toBeNull();
    expect(screen.queryByTestId('record-waveform-static')).toBeNull();
  });

  it('renders the live waveform while recording', () => {
    render(
      <RecordingWaveform status={RecorderStatus.Recording} elapsedMs={4_000} />,
    );

    expect(screen.getByTestId('record-waveform-live')).toBeTruthy();
    expect(screen.queryByTestId('record-waveform-static')).toBeNull();
  });

  it('renders the live waveform while paused', () => {
    render(
      <RecordingWaveform status={RecorderStatus.Paused} elapsedMs={3_000} />,
    );

    expect(screen.getByTestId('record-waveform-live')).toBeTruthy();
  });

  it('renders the static waveform in review', () => {
    render(<RecordingWaveform status={RecorderStatus.Review} elapsedMs={0} />);

    expect(screen.queryByTestId('record-waveform-live')).toBeNull();
    expect(screen.getByTestId('record-waveform-static')).toBeTruthy();
  });

  it('shows the current position over the total duration in review', () => {
    render(
      <RecordingWaveform
        status={RecorderStatus.Review}
        elapsedMs={10_000}
        positionMs={2_500}
        durationMs={10_000}
      />,
    );

    expect(screen.getByTestId('record-review-position')).toHaveTextContent(
      '00:02:50 / 00:10:00',
    );
  });

  it('shows the scrub target position while dragging in review', () => {
    const onSeek = jest.fn();
    render(
      <RecordingWaveform
        status={RecorderStatus.Review}
        elapsedMs={10_000}
        positionMs={0}
        durationMs={10_000}
        onSeek={onSeek}
      />,
    );

    const waveform = screen.getByTestId('record-waveform-static');
    fireEvent(waveform, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 72 } },
    });
    fireEvent(waveform, 'responderGrant', {
      nativeEvent: { locationX: 150 },
    });

    expect(screen.getByTestId('record-review-position')).toHaveTextContent(
      '00:07:50 / 00:10:00',
    );
  });

  it('seeks to the scrubbed position on release in review', () => {
    const onSeek = jest.fn();
    render(
      <RecordingWaveform
        status={RecorderStatus.Review}
        elapsedMs={10_000}
        positionMs={0}
        durationMs={10_000}
        onSeek={onSeek}
      />,
    );

    const waveform = screen.getByTestId('record-waveform-static');
    fireEvent(waveform, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 72 } },
    });
    fireEvent(waveform, 'responderRelease', {
      nativeEvent: { locationX: 50 },
    });

    expect(onSeek).toHaveBeenCalledWith(2_500);
  });

  it('holds the fill at the seek target after release instead of snapping back to the stale position', () => {
    const onSeek = jest.fn();
    const { toJSON } = render(
      <RecordingWaveform
        status={RecorderStatus.Review}
        elapsedMs={10_000}
        // Stale position left over from before the drag — if the fill fell
        // back to this immediately on release (the flicker bug), it would
        // render 0 filled bars instead of the dragged-to target.
        positionMs={0}
        durationMs={10_000}
        onSeek={onSeek}
      />,
    );

    const waveform = screen.getByTestId('record-waveform-static');
    fireEvent(waveform, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 72 } },
    });
    // Drag to 75% (locationX 150 of 200) and release.
    fireEvent(waveform, 'responderRelease', {
      nativeEvent: { locationX: 150 },
    });

    expect(onSeek).toHaveBeenCalledWith(7_500);
    expect(countFilledBars(toJSON())).toBe(17);
  });

  it('hands the fill back to positionMs once it confirms the seek landed', () => {
    const onSeek = jest.fn();
    const { toJSON, rerender } = render(
      <RecordingWaveform
        status={RecorderStatus.Review}
        elapsedMs={10_000}
        positionMs={0}
        durationMs={10_000}
        onSeek={onSeek}
      />,
    );

    const waveform = screen.getByTestId('record-waveform-static');
    fireEvent(waveform, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 72 } },
    });
    fireEvent(waveform, 'responderRelease', {
      nativeEvent: { locationX: 150 },
    });
    expect(countFilledBars(toJSON())).toBe(17);

    // Player status catches up to the seek target.
    rerender(
      <RecordingWaveform
        status={RecorderStatus.Review}
        elapsedMs={10_000}
        positionMs={7_500}
        durationMs={10_000}
        onSeek={onSeek}
      />,
    );

    expect(countFilledBars(toJSON())).toBe(17);
  });
});
