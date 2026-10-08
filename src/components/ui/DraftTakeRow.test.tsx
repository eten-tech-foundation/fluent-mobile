import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { theme, iconSizes } from '../../theme';
import { DraftTakeRow } from './DraftTakeRow';

const SPACER_ID = 'record-take-delete-spacer-t1';
const hidden = { includeHiddenElements: true };

const baseProps = {
  takeId: 't1',
  takeNumber: 1,
  positionMs: 0,
  durationMs: 3000,
  isPlaying: false,
  isSelected: false,
  onPlayPause: jest.fn(),
};

describe('DraftTakeRow trailing slot (#571)', () => {
  it('reserves the delete slot when onDelete is omitted (stitched row)', () => {
    const { getByTestId, queryByTestId } = render(
      <DraftTakeRow {...baseProps} leadingIndicator="none" />,
    );
    expect(getByTestId(SPACER_ID, hidden)).toBeTruthy();
    expect(queryByTestId('record-delete-button-t1')).toBeNull();
  });

  it('renders the delete button and no spacer when onDelete is provided', () => {
    const { getByTestId, queryByTestId } = render(
      <DraftTakeRow {...baseProps} onDelete={jest.fn()} />,
    );
    expect(getByTestId('record-delete-button-t1')).toBeTruthy();
    expect(queryByTestId(SPACER_ID, hidden)).toBeNull();
  });

  it('spacer width matches the delete button footprint', () => {
    const { getByTestId } = render(
      <DraftTakeRow {...baseProps} leadingIndicator="none" />,
    );
    const style = StyleSheet.flatten(
      getByTestId(SPACER_ID, hidden).props.style,
    );
    expect(style.width).toBe(iconSizes.chevron + theme.spacing.xs * 2);
  });

  it('canonicalReadOnly row keeps its check icon and reserves the slot', () => {
    const { getByTestId } = render(
      <DraftTakeRow
        {...baseProps}
        leadingIndicator="canonicalReadOnly"
        isCanonical
      />,
    );
    expect(getByTestId('record-take-canonical-readonly-t1')).toBeTruthy();
    expect(getByTestId(SPACER_ID, hidden)).toBeTruthy();
  });
});

describe('DraftTakeRow long take labels (#589)', () => {
  const longPericopeLabel = 'Take 1 - Pericope - vv. 8:31-9:1';

  it('renders the full pericope label without a single-line clamp', () => {
    const { getByTestId, getByText } = render(
      <DraftTakeRow {...baseProps} label={longPericopeLabel} />,
    );

    const badge = getByTestId('record-take-badge-t1');
    expect(getByText(longPericopeLabel)).toBeTruthy();
    expect(badge.props.numberOfLines).toBeUndefined();
  });

  it('keeps the playback timer visible beside a long label', () => {
    const { getByTestId } = render(
      <DraftTakeRow
        {...baseProps}
        label={longPericopeLabel}
        positionMs={1000}
        durationMs={13000}
      />,
    );

    expect(getByTestId('record-take-time-t1')).toHaveTextContent('0:01 / 0:13');
  });

  it('still renders short verse labels', () => {
    const verseLabel = 'Take 2 - Verse - v. 3';
    const { getByText } = render(
      <DraftTakeRow {...baseProps} label={verseLabel} />,
    );
    expect(getByText(verseLabel)).toBeTruthy();
  });
});
