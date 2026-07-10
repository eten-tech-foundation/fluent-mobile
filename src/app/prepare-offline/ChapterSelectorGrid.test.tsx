import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ChapterSelectorGrid } from './ChapterSelectorGrid';

describe('ChapterSelectorGrid', () => {
  it('renders chapter numbers and toggles selection', () => {
    const onToggleChapter = jest.fn();
    const selectedIds = new Set<number>();

    const { rerender } = render(
      <ChapterSelectorGrid
        chapterIds={[1, 2]}
        chapterNumbers={[3, 4]}
        selectedIds={selectedIds}
        onToggleChapter={onToggleChapter}
      />,
    );

    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Chapter 3'));
    expect(onToggleChapter).toHaveBeenCalledWith(1);

    rerender(
      <ChapterSelectorGrid
        chapterIds={[1, 2]}
        chapterNumbers={[3, 4]}
        selectedIds={new Set([1])}
        onToggleChapter={onToggleChapter}
      />,
    );

    expect(screen.getByLabelText('Chapter 3').props.accessibilityState).toEqual(
      {
        checked: true,
      },
    );
  });
});
