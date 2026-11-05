import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PassageVerse } from '../../../../hooks/usePassage';
import type { VerseSteps } from './useRecorder';
import { VersePages } from './VersePages';

jest.mock('../../../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));

const verse = (n: number): PassageVerse => ({
  chapterNumber: 2,
  verseNumber: n,
  text: `Verse ${n} text`,
  recorded: null,
});

function steps(over: Partial<VerseSteps> = {}): VerseSteps {
  return {
    current: 11,
    index: 0,
    verses: [verse(11), verse(12), verse(13)],
    previous: null,
    next: 12,
    locked: false,
    go: jest.fn(),
    ...over,
  };
}

function laidOut(props: VerseSteps) {
  render(<VersePages steps={props} />);
  fireEvent(screen.getByTestId('passage-verse-pages'), 'layout', {
    nativeEvent: { layout: { width: 300, height: 600 } },
  });
}

describe('VersePages', () => {
  it('moves to the verse swiped to', () => {
    const props = steps();
    laidOut(props);
    fireEvent(screen.getByTestId('passage-verse-pager'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 600, y: 0 } },
    });

    expect(props.go).toHaveBeenCalledWith(13);
  });

  it('stays on the verse when a swipe settles where it started', () => {
    const props = steps();
    laidOut(props);
    fireEvent(screen.getByTestId('passage-verse-pager'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 0, y: 0 } },
    });

    expect(props.go).not.toHaveBeenCalled();
  });

  it('turns pages from TalkBack on the position row', () => {
    const props = steps();
    laidOut(props);
    const position = screen.getByTestId('passage-verse-position');

    expect(position.props.accessibilityRole).toBe('adjustable');
    fireEvent(position, 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(props.go).toHaveBeenCalledWith(12);
  });

  it('turns no page from TalkBack while a take is in progress', () => {
    laidOut(steps({ locked: true }));

    expect(
      screen.getByTestId('passage-verse-position').props.accessibilityActions,
    ).toEqual([]);
  });

  it("doesn't swipe while a take is in progress or saving", () => {
    laidOut(steps({ locked: true }));

    expect(screen.getByTestId('passage-verse-pager').props.scrollEnabled).toBe(
      false,
    );
  });

  it('follows the verse playing', () => {
    const props = steps();
    laidOut(props);
    screen.rerender(<VersePages steps={props} playing={13} />);

    expect(screen.getByLabelText('Verse 13, 3 of 3')).toBeTruthy();
  });

  it('holds a swiped verse until the audio gets there', () => {
    const props = steps();
    laidOut(props);
    screen.rerender(<VersePages steps={props} playing={11} />);
    fireEvent(screen.getByTestId('passage-verse-pager'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 600, y: 0 } },
    });
    screen.rerender(<VersePages steps={props} playing={11} />);

    expect(screen.getByLabelText('Verse 13, 3 of 3')).toBeTruthy();
    screen.rerender(
      <VersePages steps={{ ...props, current: 13, index: 2 }} playing={13} />,
    );
    screen.rerender(
      <VersePages steps={{ ...props, current: 13, index: 2 }} playing={12} />,
    );
    expect(screen.getByLabelText('Verse 12, 2 of 3')).toBeTruthy();
  });

  it('draws the verse chip in place of its dot, and says when it is recorded', () => {
    render(
      <VersePages
        steps={steps({
          current: 12,
          index: 1,
          verses: [verse(11), { ...verse(12), recorded: 'verse' }, verse(13)],
        })}
      />,
    );

    const row = screen.getByLabelText('Verse 12, recorded, 2 of 3');
    expect(row.children).toHaveLength(3);
    expect(screen.getByText('12')).toBeTruthy();
  });

  it('shows the verse chip and a count instead of dots past 12', () => {
    const many = Array.from({ length: 20 }, (_, i) => verse(i + 1));
    render(
      <VersePages steps={steps({ verses: many, index: 2, current: 3 })} />,
    );

    expect(screen.getByLabelText('Verse 3, 3 of 20')).toBeTruthy();
    expect(screen.getByText('of 20')).toBeTruthy();
  });
});
