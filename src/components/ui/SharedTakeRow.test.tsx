import React from 'react';
import { SharedTakeRow } from './SharedTakeRow';
import { fireEvent, render } from '@testing-library/react-native';

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

describe('SharedTakeRow take identity', () => {
  it('scopes testIDs by take id when one is provided', () => {
    const { getByTestId } = render(
      <SharedTakeRow {...baseProps} takeId="42" />,
    );
    expect(getByTestId('shared-take-row-42')).toBeTruthy();
    expect(getByTestId('shared-take-play-button-42')).toBeTruthy();
    expect(getByTestId('shared-take-canonical-42')).toBeTruthy();
  });
});

describe('SharedTakeRow canonical designation', () => {
  it('renders a pressable canonical control when onDesignateCanonical is provided', () => {
    const onDesignateCanonical = jest.fn();
    const { getByTestId } = render(
      <SharedTakeRow
        {...baseProps}
        onDesignateCanonical={onDesignateCanonical}
      />,
    );

    fireEvent.press(getByTestId('shared-take-canonical'));
    expect(onDesignateCanonical).toHaveBeenCalledTimes(1);
  });

  it('renders no control and a layout spacer when locked and not canonical', () => {
    const { queryByTestId, getByTestId } = render(
      <SharedTakeRow
        {...baseProps}
        onDesignateCanonical={undefined}
        isCanonical={false}
      />,
    );

    expect(queryByTestId('shared-take-canonical')).toBeNull();
    expect(queryByTestId('shared-take-canonical-readonly')).toBeNull();
    // The spacer is hidden from accessibility on purpose, so opt in to hidden
    // elements or the query will never see it.
    expect(
      getByTestId('shared-take-canonical-spacer', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
  });

  it('shows a read-only canonical mark when locked and canonical', () => {
    const { queryByTestId, getByTestId } = render(
      <SharedTakeRow
        {...baseProps}
        onDesignateCanonical={undefined}
        isCanonical
      />,
    );

    expect(queryByTestId('shared-take-canonical')).toBeNull();
    expect(getByTestId('shared-take-canonical-readonly')).toBeTruthy();
    expect(
      queryByTestId('shared-take-canonical-spacer', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
  });
});
