import type { ChapterAssignmentData } from '../types/db/types';
import {
  getStageAdvanceDestination,
  getStageAdvanceVisibility,
  isDrafterBlockedFromOpenPeerCheckCapture,
  resolvePeerCheckerAssignmentOnAdvance,
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

  it('returns null for prototype-pollution-style keys, not inherited Object properties', () => {
    expect(getStageAdvanceDestination('constructor')).toBeNull();
    expect(getStageAdvanceDestination('__proto__')).toBeNull();
    expect(getStageAdvanceDestination('toString')).toBeNull();
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
        isOnLastUnit: true,
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
        isOnLastUnit: true,
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
        isOnLastUnit: true,
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
        isOnLastUnit: true,
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
        isOnLastUnit: true,
      }).visible,
    ).toBe(false);
  });

  it('hides Send to Community Review from the drafter when Peer Check is unassigned', () => {
    expect(
      getStageAdvanceVisibility({
        chapterData: {
          ...baseChapter,
          status: 'peer_check',
          peerCheckerId: undefined,
        },
        currentUserId: 10,
        hasChapterRecording: true,
        hasConflict: false,
        isOnLastUnit: true,
      }).visible,
    ).toBe(false);
  });

  it('shows Send to Community Review to any non-drafter when Peer Check is unassigned', () => {
    expect(
      getStageAdvanceVisibility({
        chapterData: {
          ...baseChapter,
          status: 'peer_check',
          peerCheckerId: undefined,
        },
        currentUserId: 99,
        hasChapterRecording: false,
        hasConflict: false,
        isOnLastUnit: true,
      }),
    ).toMatchObject({
      visible: true,
      disabled: false,
      destination: { buttonLabel: 'Send to Community Review' },
    });
  });

  it('hides Send to Community Review from a non-assignee when a Peer Checker is PM-assigned', () => {
    expect(
      getStageAdvanceVisibility({
        chapterData: { ...baseChapter, status: 'peer_check' },
        currentUserId: 99,
        hasChapterRecording: true,
        hasConflict: false,
        isOnLastUnit: true,
      }).visible,
    ).toBe(false);
  });

  it('hides Send to Community Review when Peer Check lacks a drafter id', () => {
    expect(
      getStageAdvanceVisibility({
        chapterData: {
          ...baseChapter,
          status: 'peer_check',
          assignedUserId: undefined,
          peerCheckerId: undefined,
        },
        currentUserId: 99,
        hasChapterRecording: true,
        hasConflict: false,
        isOnLastUnit: true,
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
        isOnLastUnit: true,
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
          isOnLastUnit: true,
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
        isOnLastUnit: true,
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
        isOnLastUnit: true,
      }),
    ).toMatchObject({ visible: true, disabled: true });
  });

  describe('isOnLastUnit gate (#542)', () => {
    it('hides an otherwise-visible drafting CTA when not on the last unit', () => {
      expect(
        getStageAdvanceVisibility({
          chapterData: baseChapter,
          currentUserId: 10,
          hasChapterRecording: true,
          hasConflict: false,
          isOnLastUnit: false,
        }).visible,
      ).toBe(false);
    });

    it('hides an otherwise-visible peer_check CTA when not on the last unit', () => {
      expect(
        getStageAdvanceVisibility({
          chapterData: { ...baseChapter, status: 'peer_check' },
          currentUserId: 20,
          hasChapterRecording: false,
          hasConflict: false,
          isOnLastUnit: false,
        }).visible,
      ).toBe(false);
    });

    it.each([
      ['community_review', 'Send to Linguist Check'],
      ['linguist_check', 'Send to Theological Check'],
      ['theological_check', 'Send to Consultant Check'],
      ['consultant_check', 'Send to Complete'],
    ])(
      'hides the %s CTA for any translator when not on the last unit',
      status => {
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
            isOnLastUnit: false,
          }).visible,
        ).toBe(false);
      },
    );

    it('applies before the assignee/recording checks — not-last-unit hides even for a non-assignee with no recordings', () => {
      expect(
        getStageAdvanceVisibility({
          chapterData: baseChapter,
          currentUserId: 999,
          hasChapterRecording: false,
          hasConflict: false,
          isOnLastUnit: false,
        }),
      ).toMatchObject({ visible: false, disabled: false, destination: null });
    });
  });
});

describe('isDrafterBlockedFromOpenPeerCheckCapture', () => {
  it('blocks the drafter on unassigned Peer Check', () => {
    expect(
      isDrafterBlockedFromOpenPeerCheckCapture(
        {
          status: 'peer_check',
          assignedUserId: 10,
          peerCheckerId: undefined,
        },
        10,
      ),
    ).toBe(true);
  });

  it('allows a non-drafter peer on unassigned Peer Check', () => {
    expect(
      isDrafterBlockedFromOpenPeerCheckCapture(
        {
          status: 'peer_check',
          assignedUserId: 10,
          peerCheckerId: undefined,
        },
        99,
      ),
    ).toBe(false);
  });

  it('allows the PM-assigned Peer Checker', () => {
    expect(
      isDrafterBlockedFromOpenPeerCheckCapture(
        {
          status: 'peer_check',
          assignedUserId: 10,
          peerCheckerId: 20,
        },
        20,
      ),
    ).toBe(false);
  });

  it('allows the drafter during Drafting', () => {
    expect(
      isDrafterBlockedFromOpenPeerCheckCapture(
        {
          status: 'draft',
          assignedUserId: 10,
        },
        10,
      ),
    ).toBe(false);
  });
});

describe('resolvePeerCheckerAssignmentOnAdvance', () => {
  it('assigns the tapping peer when advancing unassigned Peer Check to Community Review', () => {
    expect(
      resolvePeerCheckerAssignmentOnAdvance({
        chapterData: {
          status: 'peer_check',
          assignedUserId: 10,
          peerCheckerId: undefined,
        },
        currentUserId: 99,
        nextStatus: 'community_review',
      }),
    ).toBe(99);
  });

  it('does not assign the drafter', () => {
    expect(
      resolvePeerCheckerAssignmentOnAdvance({
        chapterData: {
          status: 'peer_check',
          assignedUserId: 10,
        },
        currentUserId: 10,
        nextStatus: 'community_review',
      }),
    ).toBeUndefined();
  });

  it('leaves an existing PM Peer Checker unchanged', () => {
    expect(
      resolvePeerCheckerAssignmentOnAdvance({
        chapterData: {
          status: 'peer_check',
          assignedUserId: 10,
          peerCheckerId: 20,
        },
        currentUserId: 20,
        nextStatus: 'community_review',
      }),
    ).toBeUndefined();
  });

  it('does not assign when leaving Drafting for Peer Check', () => {
    expect(
      resolvePeerCheckerAssignmentOnAdvance({
        chapterData: {
          status: 'draft',
          assignedUserId: 10,
        },
        currentUserId: 10,
        nextStatus: 'peer_check',
      }),
    ).toBeUndefined();
  });

  it('does not assign when Peer Check lacks a drafter id', () => {
    expect(
      resolvePeerCheckerAssignmentOnAdvance({
        chapterData: {
          status: 'peer_check',
          assignedUserId: undefined,
          peerCheckerId: undefined,
        },
        currentUserId: 99,
        nextStatus: 'community_review',
      }),
    ).toBeUndefined();
  });
});

describe('stageAdvanceConfirmBody', () => {
  it('builds the confirmation copy', () => {
    expect(stageAdvanceConfirmBody('Luke 4', 'Peer Check')).toBe(
      'This marks Luke 4 as ready for Peer Check.',
    );
  });
});
