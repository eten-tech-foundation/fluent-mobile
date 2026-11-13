import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { HeldRecording } from '../../db/repositories/heldRecordingsRepository';
import {
  formatHeldRecordingLabel,
  groupHeldRecordings,
  HeldRecordingsSection,
} from './HeldRecordingsSection';

const mockPlay = jest.fn(async () => undefined);
const mockPause = jest.fn(async () => undefined);

jest.mock('../../hooks/usePlaybackEngine', () => ({
  usePlaybackEngine: () => ({
    status: 'idle',
    positionMs: 0,
    durationMs: 0,
    load: jest.fn(),
    play: mockPlay,
    resume: jest.fn(),
    pause: mockPause,
    seek: jest.fn(),
    stop: jest.fn(),
  }),
}));

jest.mock('lucide-react-native', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockIcon = () => MockReact.createElement(View);
  return {
    Circle: MockIcon,
    CircleAlert: MockIcon,
    CircleCheck: MockIcon,
    Pause: MockIcon,
    Play: MockIcon,
    Trash2: MockIcon,
  };
});

function held(overrides: Partial<HeldRecording> = {}): HeldRecording {
  return {
    id: 'held-1',
    projectId: 100,
    projectName: 'Alpha',
    bookId: 1,
    bookName: 'Genesis',
    chapterNumber: 1,
    verseNumber: 5,
    granularity: 'verse',
    startChapter: null,
    startVerse: null,
    endChapter: null,
    endVerse: null,
    takeNumber: 1,
    localFilePath: 'file:///mock-document/held-1.m4a',
    durationMs: 2000,
    ...overrides,
  };
}

describe('HeldRecordingsSection (#855)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('labels verse and pericope takes', () => {
    expect(formatHeldRecordingLabel(held())).toBe('v. 5');
    expect(
      formatHeldRecordingLabel(
        held({
          granularity: 'pericope',
          startChapter: 1,
          startVerse: 5,
          endChapter: 1,
          endVerse: 7,
        }),
      ),
    ).toBe('vv. 5–7');
    expect(
      formatHeldRecordingLabel(
        held({
          granularity: 'pericope',
          startChapter: 1,
          startVerse: 5,
          endChapter: 2,
          endVerse: 1,
        }),
      ),
    ).toBe('1:5–2:1');
    // Later takes of the same reference stay distinguishable.
    expect(formatHeldRecordingLabel(held({ takeNumber: 2 }))).toBe(
      'v. 5 · Take 2',
    );
    expect(
      formatHeldRecordingLabel(
        held({
          takeNumber: 3,
          granularity: 'pericope',
          startChapter: 1,
          startVerse: 5,
          endChapter: 1,
          endVerse: 7,
        }),
      ),
    ).toBe('vv. 5–7 · Take 3');
  });

  it('groups by project and chapter in query order', () => {
    const groups = groupHeldRecordings([
      held(),
      held({ id: 'held-2', chapterNumber: 2 }),
      held({ id: 'held-3', projectId: 200, projectName: 'Beta' }),
      held({ id: 'held-4' }),
    ]);

    expect(groups.map(group => group.projectName)).toEqual(['Alpha', 'Beta']);
    expect(groups[0]!.chapters.map(chapter => chapter.chapterNumber)).toEqual([
      1, 2,
    ]);
    expect(groups[0]!.chapters[0]!.recordings.map(record => record.id)).toEqual(
      ['held-1', 'held-4'],
    );
  });

  it('plays a held recording from the device and pauses it again', async () => {
    render(<HeldRecordingsSection recordings={[held()]} />);

    fireEvent.press(screen.getByTestId('record-play-button-held-1'));
    await waitFor(() => {
      expect(mockPlay).toHaveBeenCalledWith('file:///mock-document/held-1.m4a');
    });

    fireEvent.press(screen.getByTestId('record-play-button-held-1'));
    await waitFor(() => {
      expect(mockPause).toHaveBeenCalledTimes(1);
    });
  });

  it('stops playback when the playing row leaves the list', async () => {
    const { rerender } = render(
      <HeldRecordingsSection recordings={[held(), held({ id: 'held-2' })]} />,
    );
    fireEvent.press(screen.getByTestId('record-play-button-held-1'));
    await waitFor(() => {
      expect(mockPlay).toHaveBeenCalledTimes(1);
    });

    rerender(<HeldRecordingsSection recordings={[held({ id: 'held-2' })]} />);

    await waitFor(() => {
      expect(mockPause).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps playing while its row stays in the list', async () => {
    const { rerender } = render(
      <HeldRecordingsSection recordings={[held(), held({ id: 'held-2' })]} />,
    );
    fireEvent.press(screen.getByTestId('record-play-button-held-1'));
    await waitFor(() => {
      expect(mockPlay).toHaveBeenCalledTimes(1);
    });

    rerender(<HeldRecordingsSection recordings={[held()]} />);

    expect(mockPause).not.toHaveBeenCalled();
  });

  it('renders nothing when there are no held recordings', () => {
    render(<HeldRecordingsSection recordings={[]} />);
    expect(screen.queryByTestId('sync-held-section')).toBeNull();
  });
});
