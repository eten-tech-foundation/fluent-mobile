import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { BookCover } from './BookCover';
import { measureFace, ringFill } from '../../test/coverBadge';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

const hidden = { includeHiddenElements: true };

function renderBook(recorded: number, peerChecked = false) {
  render(
    <BookCover
      bookName="Mark"
      recorded={recorded}
      peerChecked={peerChecked}
      testID="book"
    />,
  );
  measureFace('book-face');
}

describe('BookCover', () => {
  beforeEach(() => {
    mockPreferenceStore();
  });

  it('has no badge before a chapter is recorded', () => {
    renderBook(0);
    expect(screen.queryByTestId('cover-badge', hidden)).toBeNull();
  });

  it('fills the ring as its chapters are recorded', () => {
    renderBook(0.4);
    expect(ringFill()).toBeCloseTo(0.4);
    expect(screen.queryByTestId('cover-badge-check', hidden)).toBeNull();
  });

  it('shows a check once every chapter passes peer check', () => {
    renderBook(1, true);
    expect(screen.getByTestId('cover-badge-check', hidden)).toBeTruthy();
    expect(screen.queryByTestId('cover-badge-ring', hidden)).toBeNull();
  });
});
