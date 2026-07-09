import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { RecordingWaveform } from './RecordingWaveform';
import { RecorderStatus } from '../../../../../types/recording/types';

function layout(node: ReturnType<typeof screen.getByTestId>, width: number) {
  fireEvent(node, 'layout', {
    nativeEvent: { layout: { width, height: 72, x: 0, y: 0 } },
  });
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

  it('is not scrubbable without a duration', () => {
    const onSeek = jest.fn();
    render(
      <RecordingWaveform
        status={RecorderStatus.Review}
        elapsedMs={0}
        durationMs={0}
        onSeek={onSeek}
      />,
    );

    const node = screen.getByTestId('record-waveform-static');
    layout(node, 200);
    fireEvent(node, 'responderRelease', { nativeEvent: { locationX: 100 } });

    expect(onSeek).not.toHaveBeenCalled();
    expect(node.props.accessibilityRole).toBeUndefined();
  });

  it('seeks to the tapped position in review', () => {
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

    const node = screen.getByTestId('record-waveform-static');
    expect(node.props.accessibilityRole).toBe('adjustable');
    layout(node, 200);
    fireEvent(node, 'responderRelease', { nativeEvent: { locationX: 100 } });

    expect(onSeek).toHaveBeenCalledWith(5_000);
  });

  it('clamps a scrub past the end to the take duration', () => {
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

    const node = screen.getByTestId('record-waveform-static');
    layout(node, 200);
    fireEvent(node, 'responderRelease', { nativeEvent: { locationX: 999 } });

    expect(onSeek).toHaveBeenCalledWith(10_000);
  });

  it('does not seek before the container has measured its width', () => {
    const onSeek = jest.fn();
    render(
      <RecordingWaveform
        status={RecorderStatus.Review}
        elapsedMs={10_000}
        durationMs={10_000}
        onSeek={onSeek}
      />,
    );

    const node = screen.getByTestId('record-waveform-static');
    fireEvent(node, 'responderRelease', { nativeEvent: { locationX: 100 } });

    expect(onSeek).not.toHaveBeenCalled();
  });
});
