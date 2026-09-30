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
    const style = StyleSheet.flatten(getByTestId(SPACER_ID, hidden).props.style);
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