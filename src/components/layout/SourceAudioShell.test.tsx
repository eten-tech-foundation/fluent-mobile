import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SourceAudioBarSlot, SourceAudioProvider } from './SourceAudioShell';
import type { ChapterAssignmentData } from '../../types/db/types';

const mockUseSourceAudio = jest.fn();

jest.mock('../../hooks/useSourceAudio', () => ({
  useSourceAudio: (...args: unknown[]) => mockUseSourceAudio(...args),
}));

const chapterData: ChapterAssignmentData = {
  id: 1,
  projectUnitId: 1,
  projectId: 1,
  bibleId: 1,
  bookId: 40,
  chapterNumber: 14,
  bibleAbbreviation: 'BSB',
  bookCode: 'MRK',
  status: 'unassigned', // Required field
  hasConflict: false, // Required field
};

const sourceAudioValue = {
  loadState: 'ready' as const,
  positionMs: 0,
  durationMs: 60000,
  isPlaying: false,
  unitLabel: 'Verse 1 / 3',
  sourceLabel: 'BSB',
  togglePlay: jest.fn(),
  seek: jest.fn(),
  retry: jest.fn(),
  pause: jest.fn(),
};

function renderSlot(
  activeTab: 'bible' | 'record' | 'resources',
  recordCaptureActive = false,
) {
  mockUseSourceAudio.mockReturnValue(sourceAudioValue);

  return render(
    <SourceAudioProvider chapterData={chapterData} userId={7}>
      <SourceAudioBarSlot
        activeTab={activeTab}
        recordCaptureActive={recordCaptureActive}
      />
    </SourceAudioProvider>,
  );
}

describe('SourceAudioBarSlot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the player on the Bible tab', () => {
    renderSlot('bible');
    expect(screen.getByTestId('source-audio-bar')).toBeTruthy();
  });

  it('shows the player on the Record tab', () => {
    renderSlot('record');
    expect(screen.getByTestId('source-audio-bar')).toBeTruthy();
  });

  it('hides the player on the Resources tab', () => {
    renderSlot('resources');
    expect(screen.queryByTestId('source-audio-bar')).toBeNull();
  });

  it('hides the player while recording is active', () => {
    renderSlot('record', true);
    expect(screen.queryByTestId('source-audio-bar')).toBeNull();
  });
});
