import { logger } from '../utils/logger';
import {
  pickSyncPhaseCounts,
  resolveBibleTextFullFetchReason,
  startPhase,
  SYNC_PHASE_FIELDS,
  SYNC_PHASE_LOG_MESSAGE,
} from './syncPhaseTiming';

describe('syncPhaseTiming', () => {
  const transport = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    logger.setTransport(transport);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    logger.reset();
  });

  describe('pickSyncPhaseCounts', () => {
    it('keeps only allowlisted numeric counts and fullFetchReason', () => {
      expect(
        pickSyncPhaseCounts({
          attempt: 2,
          rows: 14,
          chunks: 3,
          fullFetchReason: 'missing_chapter',
        }),
      ).toEqual({
        attempt: 2,
        rows: 14,
        chunks: 3,
        fullFetchReason: 'missing_chapter',
      });
    });

    it('redacts tokens, emails, user ids, verse text, and request bodies', () => {
      const picked = pickSyncPhaseCounts({
        attempt: 1,
        email: 'user@example.com',
        token: 'secret-token',
        authorization: 'Bearer secret-token',
        userId: '42',
        user_id: 42,
        text: 'In the beginning',
        verseText: 'In the beginning',
        body: { chapters: [1] },
        requestBody: '{"chapters":[1]}',
        recordingContent: 'audio-bytes',
      });

      expect(picked).toEqual({ attempt: 1 });
      expect(JSON.stringify(picked)).not.toMatch(
        /user@example\.com|secret-token|In the beginning|Bearer|audio-bytes/i,
      );
      expect(
        Object.keys(picked).every(key =>
          (SYNC_PHASE_FIELDS as readonly string[]).includes(key),
        ),
      ).toBe(true);
    });

    it('drops non-finite numbers and unknown fullFetchReason values', () => {
      expect(
        pickSyncPhaseCounts({
          attempt: Number.NaN,
          rows: Number.POSITIVE_INFINITY,
          chunks: '1',
          fullFetchReason: 'email-leak',
        }),
      ).toEqual({});
    });
  });

  describe('resolveBibleTextFullFetchReason', () => {
    it('prefers remap over a supplied cursor', () => {
      expect(
        resolveBibleTextFullFetchReason('2026-01-01T00:00:00.000Z', true, true),
      ).toBe('remap');
    });

    it('reports missing_chapter when the count check drops the cursor', () => {
      expect(
        resolveBibleTextFullFetchReason(
          '2026-01-01T00:00:00.000Z',
          false,
          true,
        ),
      ).toBe('missing_chapter');
    });

    it('reports no_cursor when nothing supplied a watermark', () => {
      expect(resolveBibleTextFullFetchReason(undefined, false, false)).toBe(
        'no_cursor',
      );
    });

    it('omits a reason for incremental cursor fetches', () => {
      expect(
        resolveBibleTextFullFetchReason(
          '2026-01-01T00:00:00.000Z',
          false,
          false,
        ),
      ).toBeUndefined();
    });
  });

  describe('startPhase', () => {
    it('emits phase and elapsedMs from Date.now boundaries', () => {
      const now = jest.spyOn(Date, 'now');
      now.mockReturnValueOnce(1_000).mockReturnValueOnce(1_240);

      startPhase('bibleTexts.write').end({ rows: 8, chunks: 0 });

      expect(transport).toHaveBeenCalledWith(
        'info',
        'SyncPhase',
        SYNC_PHASE_LOG_MESSAGE,
        {
          phase: 'bibleTexts.write',
          elapsedMs: 240,
          rows: 8,
          chunks: 0,
        },
      );
    });

    it('does not emit redacted fields even when end() is passed extras', () => {
      jest.spyOn(Date, 'now').mockReturnValue(5_000);

      startPhase('http.network').end({
        attempt: 1,
        email: 'user@example.com',
        token: 'abc',
        text: 'verse',
      });

      const context = transport.mock.calls[0][3] as Record<string, unknown>;
      expect(Object.keys(context).sort()).toEqual(
        ['attempt', 'elapsedMs', 'phase'].sort(),
      );
      expect(context).toEqual({
        phase: 'http.network',
        elapsedMs: 0,
        attempt: 1,
      });
    });
  });
});
