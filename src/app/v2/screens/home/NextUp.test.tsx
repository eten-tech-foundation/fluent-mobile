import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
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

  it('leaves out a milestone named for its book', () => {
    expect(
      nextUpStatusLine(
        item('a', {}, { ...MATTHEW_1, milestoneName: 'Matthew' }),
      ),
    ).toBe('Draft');
  });

  it('says what I am doing on a chapter and what it has to sync', () => {
    expect(
      nextUpStatusLine(item('a', {}, { ...MATTHEW_1, listAccess: 'observer' })),
    ).toBe('Observing · Gospels Phase 1');
    expect(
      nextUpStatusLine(
        item('a', {}, { ...MATTHEW_1, workflowStage: 'peer_check' }),
      ),
    ).toBe('Peer check · Gospels Phase 1');
    expect(
      nextUpStatusLine(
        item('a', {}, { ...MATTHEW_1, syncState: 'deviceOnly' }),
      ),
    ).toBe('Draft · Gospels Phase 1 · Upload pending');
    expect(
      nextUpStatusLine(
        item(
          'a',
          {},
          {
            ...MATTHEW_1,
            syncState: 'deviceOnly',
            hasConflict: true,
          },
        ),
      ),
    ).toBe('Draft · Gospels Phase 1 · Sync conflict');
  });
});

describe('NextUp', () => {
  it('opens the passage from the hero, one TalkBack stop', () => {
    const onOpen = jest.fn();
    const hero = item('birth', { recordedStatus: 'partial' });
    render(
      <NextUp
        nextUp={{ status: 'ready', hero, after: [], checking: [] }}
        onOpen={onOpen}
      />,
    );

    expect(screen.getByRole('header', { name: 'Next up' })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.press(
      screen.getByRole('button', {
        name: 'Birth, Matthew 1:18–25, Draft · Gospels Phase 1. Keep recording.',
      }),
    );
    expect(onOpen).toHaveBeenCalledWith(hero);
    expect(screen.getByText('Birth')).toBeTruthy();
    expect(screen.queryByText('Matthew 1:18–25')).toBeNull();
    expect(screen.queryByText('Then')).toBeNull();
  });

  it('leaves the reference to the cover when the passage has no title', () => {
    render(
      <NextUp
        nextUp={{
          status: 'ready',
          hero: item('chapter:1', { title: null }),
          after: [],
          checking: [],
        }}
        onOpen={jest.fn()}
      />,
    );

    expect(screen.queryByText('Matthew 1:18–25')).toBeNull();
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
        nextUp={{
          status: 'ready',
          hero: item('birth'),
          after: [next],
          checking: [],
        }}
        onOpen={onOpen}
      />,
    );

    expect(screen.getByText('Then')).toBeTruthy();
    expect(screen.queryByText('Matthew 1:1–17')).toBeNull();
    fireEvent.press(screen.getByTestId('home-next-1:genealogy'));
    expect(onOpen).toHaveBeenCalledWith(next);
  });

  it('lays out every check at once, drawing the art off screen a frame later', async () => {
    const checks = Array.from({ length: 12 }, (_, i) =>
      item('chapter:1', { title: null }, {
        ...MATTHEW_1,
        id: i + 1,
        workflowStage: 'peer_check',
      } as MyWorkChapter),
    );
    render(
      <NextUp
        nextUp={{ status: 'ready', hero: null, after: [], checking: checks }}
        onOpen={jest.fn()}
      />,
    );

    const last = 'home-next-12:chapter:1';
    expect(screen.getByTestId(last).props.accessibilityLabel).toMatch(
      /Not recorded yet$/,
    );
    // Only the drawn face measures itself.
    expect(
      screen.getByTestId('home-next-1:chapter:1-face').props.onLayout,
    ).toBeDefined();
    expect(screen.getByTestId(`${last}-face`).props.onLayout).toBeUndefined();

    await waitFor(() =>
      expect(screen.getByTestId(`${last}-face`).props.onLayout).toBeDefined(),
    );
  });

  it('waits for the passages before showing anything', () => {
    render(<NextUp nextUp={{ status: 'loading' }} onOpen={jest.fn()} />);

    expect(screen.queryByTestId('home-next-up')).toBeNull();
  });

  it('points to the books when nothing is left to record', () => {
    render(
      <NextUp
        nextUp={{ status: 'ready', hero: null, after: [], checking: [] }}
        onOpen={jest.fn()}
      />,
    );

    expect(screen.getByText(NEXT_UP_EMPTY_MESSAGE)).toBeTruthy();
  });
});
