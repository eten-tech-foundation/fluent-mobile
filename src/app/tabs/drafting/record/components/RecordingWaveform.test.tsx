import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import {
  RecordingWaveform,
  LIVE_WAVEFORM_BARS,
  MIN_BAR_HEIGHT,
  MAX_BAR_HEIGHT,
} from './RecordingWaveform';
import { RecorderStatus } from '../../../../../types/recording/types';

function barStyles(testID: string): ViewStyle[] {
  return screen
    .getByTestId(testID)
    .children.map(child =>
      StyleSheet.flatten(
        (child as unknown as { props: { style: ViewStyle } }).props.style,
      ),
    );
}

describe('RecordingWaveform', () => {
  it('renders nothing for idle status', () => {
    render(<RecordingWaveform status={RecorderStatus.Idle} />);

    expect(screen.queryByTestId('record-waveform-live')).toBeNull();
    expect(screen.queryByTestId('record-waveform-static')).toBeNull();
  });

  it('renders the live waveform while recording', () => {
    render(<RecordingWaveform status={RecorderStatus.Recording} levels={[]} />);

    expect(screen.getByTestId('record-waveform-live')).toBeTruthy();
    expect(screen.queryByTestId('record-waveform-static')).toBeNull();
  });

  it('renders the live waveform while paused', () => {
    render(<RecordingWaveform status={RecorderStatus.Paused} levels={[]} />);

    expect(screen.getByTestId('record-waveform-live')).toBeTruthy();
  });

  it('sizes bars from the levels, right-aligned with the newest sample last', () => {
    render(
      <RecordingWaveform status={RecorderStatus.Recording} levels={[1]} />,
    );

    const styles = barStyles('record-waveform-live');
    expect(styles).toHaveLength(LIVE_WAVEFORM_BARS);
    // The single (loudest) sample lands on the last bar; earlier bars stay flat.
    expect(styles[styles.length - 1]?.height).toBe(MAX_BAR_HEIGHT);
    expect(styles[0]?.height).toBe(MIN_BAR_HEIGHT);
  });

  it('renders minimum-height bars when there are no levels', () => {
    render(<RecordingWaveform status={RecorderStatus.Recording} levels={[]} />);

    const styles = barStyles('record-waveform-live');
    expect(styles.every(style => style.height === MIN_BAR_HEIGHT)).toBe(true);
  });

  it('dims the bars while paused and keeps them full opacity while recording', () => {
    render(
      <RecordingWaveform status={RecorderStatus.Recording} levels={[1]} />,
    );
    expect(barStyles('record-waveform-live')[0]?.opacity).toBe(1);

    render(<RecordingWaveform status={RecorderStatus.Paused} levels={[1]} />);
    expect(barStyles('record-waveform-live')[0]?.opacity).toBe(0.5);
  });

  it('renders the static waveform in review', () => {
    render(<RecordingWaveform status={RecorderStatus.Review} />);

    expect(screen.queryByTestId('record-waveform-live')).toBeNull();
    expect(screen.getByTestId('record-waveform-static')).toBeTruthy();
  });
});
