import React from 'react';
import { render } from '@testing-library/react-native';
import { SharedTakeRow } from './SharedTakeRow';

const baseProps = {
  takeNumber: 1,
  positionMs: 0,
  durationMs: 3000,
  isPlaying: false,
  isCanonical: false,
  onPlayPause: jest.fn(),
  onDesignateCanonical: jest.fn(),
};

describe('SharedTakeRow long take labels (#589)', () => {
  const longPericopeLabel = 'Take 1 - Pericope - vv. 8:31-9:1';

  it('renders the full pericope label without a single-line clamp', () => {
    const { getByTestId, getByText } = render(
      <SharedTakeRow {...baseProps} label={longPericopeLabel} />,
    );

    const badge = getByTestId('shared-take-badge');
    expect(getByText(longPericopeLabel)).toBeTruthy();
    expect(badge.props.numberOfLines).toBeUndefined();
  });

  it('keeps the playback timer visible beside a long label', () => {
    const { getByTestId } = render(
      <SharedTakeRow
        {...baseProps}
        label={longPericopeLabel}
        positionMs={1000}
        durationMs={13000}
      />,
    );

    expect(getByTestId('shared-take-time')).toHaveTextContent('0:01 / 0:13');
  });

  it('still renders short verse labels', () => {
    const verseLabel = 'Take 2 - Verse - v. 3';
    const { getByText } = render(
      <SharedTakeRow {...baseProps} label={verseLabel} />,
    );
    expect(getByText(verseLabel)).toBeTruthy();
  });
});
