import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PlaybackProgressBar } from './PlaybackProgressBar';
import { theme } from '../../theme';

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
});
