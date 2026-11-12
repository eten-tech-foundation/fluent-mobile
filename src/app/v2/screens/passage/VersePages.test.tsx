import React from 'react';
import { Dimensions, StyleSheet, type TextStyle } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import type { PassageVerse } from '../../../../hooks/usePassage';
import { UiVersionOverride } from '../../../../theme/useTheme';
import { resolveTheme } from '../../../../theme/uiVersion';
import type { ScriptNotes } from './noteWords';
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

  describe('when the system text size changes while the page is open', () => {
    const initial = Dimensions.get('window');
    const setFontScale = (fontScale: number) =>
      act(() => {
        const window = { ...initial, fontScale };
        Dimensions.set({ window, screen: window });
      });
    afterEach(() => setFontScale(initial.fontScale));

    // "Verse" in verse 11 carries note 0, so its chip renders beside the text.
    const notes: ScriptNotes = {
      chips: new Map([['2:11', [{ start: 0, end: 1, note: 0 }]]]),
      quotes: ['Verse'],
      current: null,
      unplaced: 0,
      unplacedAt: new Map(),
    };
    const page = (version: 'next' | 'legacy' = 'next') => (
      <UiVersionOverride value={version}>
        <VersePages steps={steps()} notes={notes} />
      </UiVersionOverride>
    );
    const lineHeights = () => {
      const text = screen.getByLabelText('Verse 11 text');
      const chip = within(
        screen.getByTestId('passage-verse-note-11-0-0'),
      ).getByText('Verse');
      const flat = (style: unknown) =>
        StyleSheet.flatten(style as TextStyle).lineHeight;
      return { text: flat(text.props.style), chip: flat(chip.props.style) };
    };
    // Next: lead 40/32, readingMax 1.3; a chip is a space/2 and two
    // stroke/2 borders (6) shorter than the line.
    const expectLine = (line: number) => {
      const got = lineHeights();
      expect(got.text).toBeCloseTo(line);
      expect(got.chip).toBeCloseTo(line - 6);
    };

    function mounted() {
      setFontScale(1);
      render(page());
      fireEvent(screen.getByTestId('passage-verse-pages'), 'layout', {
        nativeEvent: { layout: { width: 300, height: 600 } },
      });
      expectLine(40);
    }

    it('compensates the line height from 1 to 2 (40 → 26)', () => {
      mounted();
      setFontScale(2);
      screen.rerender(page());

      expectLine(26);
    });

    it('keeps the full line height below and at the reading maximum', () => {
      mounted();
      setFontScale(1.15);
      expectLine(40);
      setFontScale(1.3);
      expectLine(40);
    });

    it('caps the line height above the reading maximum, and back again', () => {
      mounted();
      setFontScale(1.5);
      expectLine((40 * 1.3) / 1.5);
      setFontScale(1);
      expectLine(40);
    });

    it('still follows a theme change at the current text size', () => {
      mounted();
      setFontScale(2);
      screen.rerender(page('legacy'));

      const legacy = resolveTheme('legacy');
      const next = resolveTheme('next');
      const text = StyleSheet.flatten(
        screen.getByLabelText('Verse 11 text').props.style as TextStyle,
      );
      expect(legacy.roles.fgPrimary).not.toBe(next.roles.fgPrimary);
      expect(text.color).toBe(legacy.roles.fgPrimary);
      expect(text.lineHeight).toBeCloseTo(
        (legacy.type.lead.lineHeight * 1.3) / 2,
      );
    });
  });
});
