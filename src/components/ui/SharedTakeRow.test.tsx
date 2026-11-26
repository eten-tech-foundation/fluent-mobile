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

  it('renders the full pericope label without a single-line clamp', async () => {
    const { getByTestId, getByText } = await render(
      <SharedTakeRow {...baseProps} label={longPericopeLabel} />,
    );

    const badge = getByTestId('shared-take-badge');
    expect(getByText(longPericopeLabel)).toBeTruthy();
    expect(badge.props.numberOfLines).toBeUndefined();
  });

  it('keeps the playback timer visible beside a long label', async () => {
    const { getByTestId } = await render(
      <SharedTakeRow
        {...baseProps}
        label={longPericopeLabel}
        positionMs={1000}
        durationMs={13000}
      />,
    );

    expect(getByTestId('shared-take-time')).toHaveTextContent('0:01 / 0:13');
  });

  it('still renders short verse labels', async () => {
    const verseLabel = 'Take 2 - Verse - v. 3';
    const { getByText } = await render(
      <SharedTakeRow {...baseProps} label={verseLabel} />,
    );
    expect(getByText(verseLabel)).toBeTruthy();
  });
});

describe('SharedTakeRow scrubbing (#833)', () => {
  it('seeks this take when onSeek is provided', async () => {
    const onSeek = jest.fn();
    const { getByTestId, getByLabelText } = await render(
      <SharedTakeRow {...baseProps} durationMs={3000} onSeek={onSeek} />,
    );

    const scrubber = getByTestId('playback-progress');
    expect(scrubber.props.onStartShouldSetResponder()).toBe(true);
    expect(getByLabelText('Draft waveform scrubber')).toBeTruthy();

    await fireEvent(scrubber, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 28 } },
    });
    await fireEvent(scrubber, 'responderGrant', {
      nativeEvent: { locationX: 50 },
    });

    expect(onSeek).toHaveBeenCalledWith(1500);
  });

  it('ignores drags when onSeek is absent', async () => {
    const { getByTestId, queryByLabelText } = await render(
      <SharedTakeRow {...baseProps} durationMs={3000} onSeek={undefined} />,
    );

    const scrubber = getByTestId('playback-progress');
    // Not seekable: the responder is never claimed, so grants are dropped.
    expect(scrubber.props.onStartShouldSetResponder()).toBe(false);
    expect(scrubber.props.accessibilityRole).toBe('progressbar');
    expect(queryByLabelText('Draft waveform scrubber')).toBeNull();
  });
});

describe('SharedTakeRow canonical designation', () => {
  it('renders a pressable canonical control when onDesignateCanonical is provided', async () => {
    const onDesignateCanonical = jest.fn();
    const { getByTestId } = await render(
      <SharedTakeRow
        {...baseProps}
        onDesignateCanonical={onDesignateCanonical}
      />,
    );

    await fireEvent.press(getByTestId('shared-take-canonical'));
    expect(onDesignateCanonical).toHaveBeenCalledTimes(1);
  });

  it('renders no control and a layout spacer when locked and not canonical', async () => {
    const { queryByTestId, getByTestId } = await render(
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

  it('shows a read-only canonical mark when locked and canonical', async () => {
    const { queryByTestId, getByTestId } = await render(
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
