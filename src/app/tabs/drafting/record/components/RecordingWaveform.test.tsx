import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { RecordingWaveform } from './RecordingWaveform';
import { RecorderStatus } from '../../../../../types/recording/types';

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
});
