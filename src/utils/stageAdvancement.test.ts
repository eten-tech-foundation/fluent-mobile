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
      nextStatus: 'community_review',
      buttonLabel: 'Send to Community Review',
      destinationLabel: 'Community Review',
    });
  });

  it('maps community_review to Linguist Check', () => {
    expect(getStageAdvanceDestination('community_review')).toEqual({
      nextStatus: 'linguist_check',
      buttonLabel: 'Send to Linguist Check',
      destinationLabel: 'Linguist Check',
    });
  });
});

it('maps linguist_check to Theological Check', () => {
  expect(getStageAdvanceDestination('linguist_check')).toEqual({
    nextStatus: 'theological_check',
    buttonLabel: 'Send to Theological Check',
    destinationLabel: 'Theological Check',
  });
});

it('maps theological_check to Consultant Check', () => {
  expect(getStageAdvanceDestination('theological_check')).toEqual({
    nextStatus: 'consultant_check',
    buttonLabel: 'Send to Consultant Check',
    destinationLabel: 'Consultant Check',
  });
});

it('maps consultant_check to Complete', () => {
  expect(getStageAdvanceDestination('consultant_check')).toEqual({
    nextStatus: 'complete',
    buttonLabel: 'Send to Complete',
    destinationLabel: 'Complete',
  });
});

it('returns null for complete (terminal stage)', () => {
  expect(getStageAdvanceDestination('complete')).toBeNull();
});

it('returns null for unrecognized status', () => {
  expect(getStageAdvanceDestination('not_a_real_stage')).toBeNull();
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

  it.each([
    ['community_review', 'Send to Linguist Check'],
    ['linguist_check', 'Send to Theological Check'],
    ['theological_check', 'Send to Consultant Check'],
    ['consultant_check', 'Send to Complete'],
  ])(
    'shows any translator at %s stage regardless of assignee/peerChecker fields',
    (status, expectedLabel) => {
      expect(
        getStageAdvanceVisibility({
          chapterData: {
            ...baseChapter,
            status,
            assignedUserId: undefined,
            peerCheckerId: undefined,
          },
          currentUserId: 999,
          hasChapterRecording: false,
          hasConflict: false,
        }),
      ).toMatchObject({
        visible: true,
        disabled: false,
        destination: { buttonLabel: expectedLabel },
      });
    },
  );

  it('hides for complete (terminal stage, no next destination)', () => {
    expect(
      getStageAdvanceVisibility({
        chapterData: { ...baseChapter, status: 'complete' },
        currentUserId: 10,
        hasChapterRecording: true,
        hasConflict: false,
      }).visible,
    ).toBe(false);
  });

  it('disables (does not hide) an advanced-stage chapter with a conflict', () => {
    expect(
      getStageAdvanceVisibility({
        chapterData: { ...baseChapter, status: 'theological_check' },
        currentUserId: 1,
        hasChapterRecording: false,
        hasConflict: true,
      }),
    ).toMatchObject({ visible: true, disabled: true });
  });
});

describe('stageAdvanceConfirmBody', () => {
  it('builds the confirmation copy', () => {
    expect(stageAdvanceConfirmBody('Luke 4', 'Peer Check')).toBe(
      'This marks Luke 4 as ready for Peer Check.',
    );
  });
});
