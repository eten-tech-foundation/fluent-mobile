import type { ChapterAssignmentData } from '../types/db/types';
import {
  getStageAdvanceDestination,
  getStageAdvanceVisibility,
  stageAdvanceConfirmBody,
} from './stageAdvancement';

const baseChapter: Pick<
  ChapterAssignmentData,
  'status' | 'assignedUserId' | 'peerCheckerId'
> = {
  status: 'draft',
  assignedUserId: 10,
  peerCheckerId: 20,
};

describe('getStageAdvanceDestination', () => {
  it('maps draft and not_started to Peer Check', () => {
    expect(getStageAdvanceDestination('draft')).toEqual({
      nextStatus: 'peer_check',
      buttonLabel: 'Send to Peer Check',
      destinationLabel: 'Peer Check',
    });
    expect(getStageAdvanceDestination('not_started')?.nextStatus).toBe(
      'peer_check',
    );
  });

  it('maps peer_check to Community Review', () => {
    expect(getStageAdvanceDestination('peer_check')).toEqual({
      nextStatus: 'community_check',
      buttonLabel: 'Send to Community Review',
      destinationLabel: 'Community Review',
    });
  });

  it('returns null for community and later stages', () => {
    expect(getStageAdvanceDestination('community_check')).toBeNull();
    expect(getStageAdvanceDestination('community_review')).toBeNull();
    expect(getStageAdvanceDestination('complete')).toBeNull();
  });
});

describe('getStageAdvanceVisibility', () => {
  it('shows enabled Send to Peer Check for assigned drafter with recordings', () => {
    expect(
      getStageAdvanceVisibility({
        chapterData: baseChapter,
        currentUserId: 10,
        hasChapterRecording: true,
        hasConflict: false,
      }),
    ).toMatchObject({
      visible: true,
      disabled: false,
      destination: { buttonLabel: 'Send to Peer Check' },
    });
  });

  it('hides when draft has no recordings', () => {
    expect(
      getStageAdvanceVisibility({
        chapterData: baseChapter,
        currentUserId: 10,
        hasChapterRecording: false,
        hasConflict: false,
      }).visible,
    ).toBe(false);
  });

  it('hides when current user is not the draft assignee', () => {
    expect(
      getStageAdvanceVisibility({
        chapterData: baseChapter,
        currentUserId: 99,
        hasChapterRecording: true,
        hasConflict: false,
      }).visible,
    ).toBe(false);
  });

  it('shows for peer checker at peer_check without requiring recordings', () => {
    expect(
      getStageAdvanceVisibility({
        chapterData: { ...baseChapter, status: 'peer_check' },
        currentUserId: 20,
        hasChapterRecording: false,
        hasConflict: false,
      }),
    ).toMatchObject({
      visible: true,
      disabled: false,
      destination: { buttonLabel: 'Send to Community Review' },
    });
  });

  it('hides for drafter at peer_check', () => {
    expect(
      getStageAdvanceVisibility({
        chapterData: { ...baseChapter, status: 'peer_check' },
        currentUserId: 10,
        hasChapterRecording: true,
        hasConflict: false,
      }).visible,
    ).toBe(false);
  });

  it('disables when conflict is set without hiding', () => {
    expect(
      getStageAdvanceVisibility({
        chapterData: baseChapter,
        currentUserId: 10,
        hasChapterRecording: true,
        hasConflict: true,
      }),
    ).toMatchObject({ visible: true, disabled: true });
  });

  it('hides for community reviewers', () => {
    expect(
      getStageAdvanceVisibility({
        chapterData: { ...baseChapter, status: 'community_check' },
        currentUserId: 10,
        hasChapterRecording: true,
        hasConflict: false,
      }).visible,
    ).toBe(false);
  });
});

describe('stageAdvanceConfirmBody', () => {
  it('builds the confirmation copy', () => {
    expect(stageAdvanceConfirmBody('Luke 4', 'Peer Check')).toBe(
      'This marks Luke 4 as ready for Peer Check.',
    );
  });
});
