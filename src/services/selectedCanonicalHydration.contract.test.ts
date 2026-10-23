import wireContract from './fixtures/selectedCanonicalHydration.wire-contract.json';
import { draftAudioResourceId } from './draftDownloadIds';
import { resolveActiveTakeDownload } from './draftAudioActiveTake';
import {
  filterChapterVerseAudioListItems,
  parseVerseAudioListResponse,
  parseVerseAudioResponse,
} from './verseAudioContract';

/**
 * Pinned fluent-api PR #455 wire contract
 * (head 86ac6a688b37e7c3c8a62302b1eb4843a0b9b7f9).
 * No live HTTP / downloads.
 */
describe('selected-canonical hydration contract (API455 pinned)', () => {
  it('pins the published API455 baseline SHAs', () => {
    expect(wireContract.baseline).toMatchObject({
      issue: 454,
      dependsOnPr: 391,
      pr391Head: 'd1baee7d84fd078d785e0db45329f8820dcefe1f',
      pr455Head: '86ac6a688b37e7c3c8a62302b1eb4843a0b9b7f9',
    });
  });

  it('parses verse matched-active with inclusive single-verse coverage', () => {
    const parsed = parseVerseAudioResponse(wireContract.verseMatchedActive);
    expect(parsed.downloadUrl).toBe(
      wireContract.verseMatchedActive.downloadUrl,
    );
    expect(parsed.granularity).toBe('verse');
    expect(parsed).toMatchObject({
      startChapter: 1,
      startVerse: 3,
      endChapter: 1,
      endVerse: 3,
      activeTakeId: 10,
    });
    const resolved = resolveActiveTakeDownload(parsed);
    expect(resolved.take.contentHash).toBe('HASH_VERSE');
    expect(resolved.coverage).toEqual({
      granularity: 'verse',
      startChapter: 1,
      startVerse: 3,
      endChapter: 1,
      endVerse: 3,
    });
    expect(
      draftAudioResourceId(
        9,
        resolved.bibleTextId,
        resolved.take.id,
        resolved.take.contentHash,
      ),
    ).toBe('draft-audio-9-3401-t10-HASH_VERSE');
  });

  it('keeps verse/pericope as alternatives on the same recording anchor', () => {
    const parsed = parseVerseAudioResponse(wireContract.pericopeMatchedActive);
    expect(parsed.id).toBe(2);
    expect(parsed.projectUnitId).toBe(12);
    expect(parsed.bibleTextId).toBe(3401);
    expect(parsed.takes.map(take => take.id)).toEqual([10, 20]);
    expect(parsed.takes.map(take => take.granularity)).toEqual([
      'verse',
      'pericope',
    ]);

    const resolved = resolveActiveTakeDownload(parsed);
    expect(resolved.take.id).toBe(20);
    expect(resolved.take.contentHash).toBe('HASH_PERICOPE');
    expect(resolved.coverage).toEqual({
      granularity: 'pericope',
      startChapter: 1,
      startVerse: 3,
      endChapter: 2,
      endVerse: 4,
    });
    expect(parsed.downloadUrl).toBe(resolved.take.downloadUrl);
    expect(
      draftAudioResourceId(
        9,
        resolved.bibleTextId,
        resolved.take.id,
        resolved.take.contentHash,
      ),
    ).toBe('draft-audio-9-3401-t20-HASH_PERICOPE');
  });

  it('exposes cross-chapter full end bounds on the anchor chapter list only', () => {
    const list = parseVerseAudioListResponse({
      items: [wireContract.pericopeMatchedActive],
      hasConflict: true,
    });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      bibleTextId: 3401,
      verseNumber: 3,
      granularity: 'pericope',
      startChapter: 1,
      startVerse: 3,
      endChapter: 2,
      endVerse: 4,
    });
    // No invented duplicate membership for chapter 2.
    expect(list.items.filter(item => item.startChapter === 2)).toHaveLength(0);
  });

  it('drops a chapter-2 list duplicate of the same anchor recording', () => {
    const chapter2Duplicate = {
      ...wireContract.pericopeMatchedActive,
      verseNumber: 4,
    };
    const chapter2List = parseVerseAudioListResponse({
      items: [chapter2Duplicate, chapter2Duplicate],
      hasConflict: true,
    });
    expect(
      filterChapterVerseAudioListItems(chapter2List.items, 2),
    ).toHaveLength(0);
    expect(filterChapterVerseAudioListItems(chapter2List.items, 1)).toEqual([
      expect.objectContaining({
        id: wireContract.pericopeMatchedActive.id,
        startChapter: 1,
        endChapter: 2,
      }),
    ]);
  });

  it('parses null active with retained takes and null top-level URL', () => {
    const parsed = parseVerseAudioResponse(wireContract.nullActiveUnavailable);
    expect(parsed.activeTakeId).toBeNull();
    expect(parsed.downloadUrl).toBeNull();
    expect(parsed.conflictStatus).toBe('clean');
    expect(parsed.takes).toHaveLength(1);
    expect(parsed.takes[0]?.contentHash).toBe('HASH_ORPHAN');
    expect(() => resolveActiveTakeDownload(parsed)).toThrow(/no activeTakeId/);
  });

  it('parses unmatched active with retained takes and null top-level URL', () => {
    const parsed = parseVerseAudioResponse(
      wireContract.unmatchedActiveUnavailable,
    );
    expect(parsed.activeTakeId).toBe(999);
    expect(parsed.downloadUrl).toBeNull();
    expect(parsed.conflictStatus).toBe('conflict');
    expect(parsed.takes).toHaveLength(1);
    expect(() => resolveActiveTakeDownload(parsed)).toThrow(
      /not present in takes/,
    );
  });

  it('keeps empty takes unavailable for null or unmatched active', () => {
    for (const activeTakeId of [null, 999] as const) {
      const parsed = parseVerseAudioResponse({
        ...wireContract.verseMatchedActive,
        activeTakeId,
        downloadUrl: null,
        takes: [],
      });
      expect(parsed.takes).toEqual([]);
      expect(parsed.downloadUrl).toBeNull();
      expect(() => resolveActiveTakeDownload(parsed)).toThrow();
    }
  });

  it('rejects invalid inclusive coverage on the exact active take', () => {
    expect(() =>
      resolveActiveTakeDownload(
        parseVerseAudioResponse({
          ...wireContract.verseMatchedActive,
          takes: [
            {
              ...wireContract.verseMatchedActive.takes[0],
              startChapter: 2,
              startVerse: 1,
              endChapter: 1,
              endVerse: 3,
            },
          ],
        }),
      ),
    ).toThrow(/invalid inclusive coverage/);
  });

  it('leaves coverage null for older payloads without coverage keys', () => {
    const older = {
      id: 1,
      projectUnitId: 12,
      bibleTextId: 3401,
      uploadedBy: 7,
      contentType: 'audio/mp4',
      sizeBytes: 4,
      durationSeconds: 12.5,
      versionToken: 1,
      conflictStatus: 'clean',
      activeTakeId: 10,
      verseNumber: 3,
      downloadUrl: 'https://example.test/old',
      takes: [
        {
          id: 10,
          uploadedBy: 7,
          contentType: 'audio/mp4',
          sizeBytes: 4,
          durationSeconds: 12.5,
          contentHash: 'HASH_OLD',
          downloadUrl: 'https://example.test/old',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    };
    const parsed = parseVerseAudioResponse(older);
    expect(parsed.granularity).toBeUndefined();
    const resolved = resolveActiveTakeDownload(parsed);
    expect(resolved.coverage).toBeNull();
    expect(resolved.take.contentHash).toBe('HASH_OLD');
  });
});
