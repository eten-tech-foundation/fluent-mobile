import {
  getActiveUserId,
  getKnownUserIds,
  isReauthRequired,
} from '../services/storage';
import { parseUserId } from './parseUserId';
import { getMyWorkCommentIndicator } from './myWorkCommentIndicator';

jest.mock('../services/storage', () => ({
  getActiveUserId: jest.fn(),
  getKnownUserIds: jest.fn(),
  isReauthRequired: jest.fn(),
}));

jest.mock('./parseUserId', () => ({
  parseUserId: jest.fn(),
}));

const mockGetActiveUserId = getActiveUserId as jest.MockedFunction<
  typeof getActiveUserId
>;
const mockGetKnownUserIds = getKnownUserIds as jest.MockedFunction<
  typeof getKnownUserIds
>;
const mockIsReauthRequired = isReauthRequired as jest.MockedFunction<
  typeof isReauthRequired
>;
const mockParseUserId = parseUserId as jest.MockedFunction<typeof parseUserId>;

const knownZeroFalseChapter = {
  commentAggregate: {
    status: 'known' as const,
    commentCount: 0,
    currentUserHasCommented: false,
    originatingUserId: '7',
  },
};

describe('getMyWorkCommentIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveUserId.mockReturnValue('7');
    mockParseUserId.mockReturnValue(7);
    mockGetKnownUserIds.mockReturnValue(['7']);
    mockIsReauthRequired.mockReturnValue(false);
  });

  it('returns known zero/false for the matching account', () => {
    expect(getMyWorkCommentIndicator(knownZeroFalseChapter)).toEqual({
      commentCount: 0,
      currentUserHasCommented: false,
      accessibilityLabel: '0 comments',
    });
  });

  it('labels commented state when the current user has commented', () => {
    expect(
      getMyWorkCommentIndicator({
        commentAggregate: {
          status: 'known',
          commentCount: 4,
          currentUserHasCommented: true,
          originatingUserId: '7',
        },
      }),
    ).toEqual({
      commentCount: 4,
      currentUserHasCommented: true,
      accessibilityLabel: '4 comments, you commented',
    });
  });

  it('hides unknown and missing aggregates', () => {
    expect(getMyWorkCommentIndicator({})).toBeNull();
    expect(
      getMyWorkCommentIndicator({ commentAggregate: { status: 'unknown' } }),
    ).toBeNull();
  });

  it('blocks stale props from another account', () => {
    expect(
      getMyWorkCommentIndicator({
        commentAggregate: {
          status: 'known',
          commentCount: 2,
          currentUserHasCommented: true,
          originatingUserId: '8',
        },
      }),
    ).toBeNull();
  });

  it('hides when active and synced ids drift', () => {
    mockGetActiveUserId.mockReturnValue('8');
    mockParseUserId.mockReturnValue(7);
    expect(
      getMyWorkCommentIndicator({
        commentAggregate: {
          status: 'known',
          commentCount: 1,
          currentUserHasCommented: false,
          originatingUserId: '7',
        },
      }),
    ).toBeNull();
  });

  it('hides stale known props when the account is no longer registered on device', () => {
    mockGetKnownUserIds.mockReturnValue([]);
    expect(getMyWorkCommentIndicator(knownZeroFalseChapter)).toBeNull();
  });

  it('hides stale known props when reauth is required for the matching account', () => {
    mockIsReauthRequired.mockReturnValue(true);
    expect(getMyWorkCommentIndicator(knownZeroFalseChapter)).toBeNull();
  });
});
