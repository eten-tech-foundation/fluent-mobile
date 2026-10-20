import React from 'react';
import { render } from '@testing-library/react-native';
import { LaunchRecoveryPrompt } from './LaunchRecoveryPrompt';

const mockNavigate = jest.fn();
const mockGetAssignment = jest.fn();
let capturedOnResume: (marker: Record<string, unknown>) => Promise<boolean>;

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
}));

jest.mock('../db/queries', () => ({
  getChapterAssignmentById: (id: number) => mockGetAssignment(id),
}));

jest.mock('../services/useLaunchRecoveryPrompt', () => ({
  useLaunchRecoveryPrompt: (options: { onResume: typeof capturedOnResume }) => {
    capturedOnResume = options.onResume;
  },
}));

describe('LaunchRecoveryPrompt', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockGetAssignment.mockReset();
  });

  it('resumes into the paused verse', async () => {
    mockGetAssignment.mockResolvedValue({ bookName: 'Mark', chapterNumber: 2 });
    render(<LaunchRecoveryPrompt />);

    await expect(
      capturedOnResume({
        chapterAssignmentId: 7,
        verseNumber: 3,
        sessionKey: 'abc',
      }),
    ).resolves.toBe(true);
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/(stack)/verse-detail',
        params: expect.objectContaining({
          chapterId: '7',
          chapterName: 'Mark 2',
          recoverVerse: '3',
          recoverSessionKey: 'abc',
        }),
      }),
    );
  });

  it.each([
    ['a marker without a verse', { chapterAssignmentId: 7 }, undefined],
    ['a missing assignment', { chapterAssignmentId: 7, verseNumber: 3 }, null],
  ])('declines %s', async (_label, marker, assignment) => {
    mockGetAssignment.mockResolvedValue(assignment);
    render(<LaunchRecoveryPrompt />);

    await expect(capturedOnResume(marker)).resolves.toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
