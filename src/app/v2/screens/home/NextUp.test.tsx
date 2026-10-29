import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  NEXT_UP_EMPTY_MESSAGE,
  NextUp,
  nextUpAction,
  nextUpStatusLine,
} from './NextUp';
import type { NextPassage } from '../../../../hooks/useNextUp';
import type { BookPassage } from '../../../../hooks/useBookPassages';
import type { MyWorkChapter } from '../../../../types/db/types';

jest.mock('../../../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));

const MATTHEW_1 = {
  id: 1,
  displayLabel: 'Matthew 1',
  bookName: 'Matthew',
  chapterNumber: 1,
  workflowStage: 'draft',
  ownershipState: 'mine',
  projectId: 9,
  projectUnitId: 3,
  milestoneName: 'Gospels Phase 1',
} as MyWorkChapter;

function item(
  key: string,
  overrides: Partial<BookPassage> = {},
  chapter: MyWorkChapter = MATTHEW_1,
): NextPassage {
  return {
    key: `${chapter.id}:${key}`,
    chapter,
    passage: {
      key,
      title: 'Birth',
      reference: 'Matthew 1:18–25',
      verses: '18–25',
      anchorVerse: 18,
      recordedStatus: 'none',
      recordedVerses: 0,
      totalVerses: 8,
      submitted: false,
      peerChecked: false,
      seed: `Matthew:${key}`,
      groupSeed: 'Matthew:1',
      ...overrides,
    },
  };
}

describe('nextUpAction', () => {
  it('keeps going on a part-recorded passage, else starts', () => {
    expect(nextUpAction(item('a', { recordedStatus: 'partial' }))).toBe(
      'Keep recording',
    );
    expect(nextUpAction(item('a'))).toBe('Start recording');
  });
});

describe('nextUpStatusLine', () => {
  it('names the stage and the milestone', () => {
    expect(nextUpStatusLine(item('a'))).toBe('Draft · Gospels Phase 1');
    expect(
      nextUpStatusLine(
        item('a', {}, { ...MATTHEW_1, workflowStage: 'not_started' }),
      ),
    ).toBe('Not started · Gospels Phase 1');
  });
});

describe('NextUp', () => {
  it('opens the passage from the hero, one TalkBack stop', () => {
    const onOpen = jest.fn();
    const hero = item('birth', { recordedStatus: 'partial' });
    render(
      <NextUp nextUp={{ status: 'ready', hero, after: [] }} onOpen={onOpen} />,
    );

    expect(screen.getByRole('header', { name: 'Next up' })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.press(
      screen.getByRole('button', {
        name: 'Birth, Matthew 1:18–25, Draft · Gospels Phase 1. Keep recording.',
      }),
    );
    expect(onOpen).toHaveBeenCalledWith(hero);
    expect(screen.getByText('Matthew 1:18–25')).toBeTruthy();
    expect(screen.queryByText('Then')).toBeNull();
  });

  it('says the reference once when the passage has no title', () => {
    render(
      <NextUp
        nextUp={{
          status: 'ready',
          hero: item('chapter:1', { title: null }),
          after: [],
        }}
        onOpen={jest.fn()}
      />,
    );

    expect(screen.getAllByText('Matthew 1:18–25')).toHaveLength(1);
    expect(
      screen.getByRole('button', {
        name: 'Matthew 1:18–25, Draft · Gospels Phase 1. Start recording.',
      }),
    ).toBeTruthy();
  });

  it('lists the passages after it and opens one', () => {
    const onOpen = jest.fn();
    const next = item('genealogy', {
      title: null,
      reference: 'Matthew 1:1–17',
      verses: '1–17',
    });
    render(
      <NextUp
        nextUp={{ status: 'ready', hero: item('birth'), after: [next] }}
        onOpen={onOpen}
      />,
    );

    expect(screen.getByText('Then')).toBeTruthy();
    fireEvent.press(screen.getByTestId('home-next-1:genealogy'));
    expect(onOpen).toHaveBeenCalledWith(next);
  });

  it('waits for the passages before showing anything', () => {
    render(<NextUp nextUp={{ status: 'loading' }} onOpen={jest.fn()} />);

    expect(screen.queryByTestId('home-next-up')).toBeNull();
  });

  it('points to the books when nothing is left to record', () => {
    render(
      <NextUp
        nextUp={{ status: 'ready', hero: null, after: [] }}
        onOpen={jest.fn()}
      />,
    );

    expect(screen.getByText(NEXT_UP_EMPTY_MESSAGE)).toBeTruthy();
  });
});
