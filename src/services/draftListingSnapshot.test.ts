import {
  DRAFT_LISTING_SNAPSHOT_MAX_ENTRIES,
  DRAFT_LISTING_SNAPSHOT_TTL_MS,
  clearDraftListingSnapshots,
  clearDraftListingSnapshotsForUser,
  draftListingSnapshotEpoch,
  invalidateDraftListingSnapshot,
  readDraftListingSnapshot,
  seedDraftListingSnapshot,
} from './draftListingSnapshot';

const chapter = { projectUnitId: 12, bibleId: 1, bookId: 41, chapterNumber: 1 };
const list = { items: [], hasConflict: false };

describe('draftListingSnapshot (#886)', () => {
  beforeEach(() => {
    clearDraftListingSnapshots();
  });

  it('returns the seeded listing with its age while fresh', () => {
    seedDraftListingSnapshot(chapter, '7', list, 1_000);
    expect(readDraftListingSnapshot(chapter, '7', 1_500)).toEqual({
      list,
      ageMs: 500,
    });
  });

  it('expires at the TTL boundary and drops the entry', () => {
    seedDraftListingSnapshot(chapter, '7', list, 1_000);
    expect(
      readDraftListingSnapshot(
        chapter,
        '7',
        1_000 + DRAFT_LISTING_SNAPSHOT_TTL_MS - 1,
      ),
    ).not.toBeNull();
    expect(
      readDraftListingSnapshot(
        chapter,
        '7',
        1_000 + DRAFT_LISTING_SNAPSHOT_TTL_MS,
      ),
    ).toBeNull();
    // Dropped: even an earlier clock does not revive it.
    expect(readDraftListingSnapshot(chapter, '7', 1_001)).toBeNull();
  });

  it('treats a clock that moved backwards as expired', () => {
    seedDraftListingSnapshot(chapter, '7', list, 5_000);
    expect(readDraftListingSnapshot(chapter, '7', 4_000)).toBeNull();
  });

  it('isolates entries per user and per chapter', () => {
    seedDraftListingSnapshot(chapter, '7', list, 1_000);
    expect(readDraftListingSnapshot(chapter, '8', 1_000)).toBeNull();
    expect(
      readDraftListingSnapshot({ ...chapter, chapterNumber: 2 }, '7', 1_000),
    ).toBeNull();
  });

  it('invalidates one chapter without touching others', () => {
    const chapterTwo = { ...chapter, chapterNumber: 2 };
    seedDraftListingSnapshot(chapter, '7', list, 1_000);
    seedDraftListingSnapshot(chapterTwo, '7', list, 1_000);
    invalidateDraftListingSnapshot(chapter, '7');
    expect(readDraftListingSnapshot(chapter, '7', 1_000)).toBeNull();
    expect(readDraftListingSnapshot(chapterTwo, '7', 1_000)).not.toBeNull();
  });

  it('sweeps expired entries on seed and caps the map at the oldest-first bound', () => {
    seedDraftListingSnapshot(chapter, '7', list, 0);
    // Seeding another chapter after the TTL sweeps the expired one.
    seedDraftListingSnapshot(
      { ...chapter, chapterNumber: 2 },
      '7',
      list,
      DRAFT_LISTING_SNAPSHOT_TTL_MS,
    );
    expect(
      readDraftListingSnapshot(chapter, '7', DRAFT_LISTING_SNAPSHOT_TTL_MS),
    ).toBeNull();

    clearDraftListingSnapshots();
    const base = 10_000;
    for (let n = 0; n < DRAFT_LISTING_SNAPSHOT_MAX_ENTRIES + 1; n += 1) {
      seedDraftListingSnapshot(
        { ...chapter, chapterNumber: n },
        '7',
        list,
        base,
      );
    }
    // Chapter 0 was the oldest seed and is evicted; the newest survives.
    expect(
      readDraftListingSnapshot({ ...chapter, chapterNumber: 0 }, '7', base),
    ).toBeNull();
    expect(
      readDraftListingSnapshot(
        { ...chapter, chapterNumber: DRAFT_LISTING_SNAPSHOT_MAX_ENTRIES },
        '7',
        base,
      ),
    ).not.toBeNull();
    expect(
      readDraftListingSnapshot({ ...chapter, chapterNumber: 1 }, '7', base),
    ).not.toBeNull();
  });

  it("clears one account's snapshots and keeps the other's", () => {
    seedDraftListingSnapshot(chapter, '7', list, 1_000);
    seedDraftListingSnapshot(chapter, '8', list, 1_000);
    clearDraftListingSnapshotsForUser('7');
    expect(readDraftListingSnapshot(chapter, '7', 1_000)).toBeNull();
    expect(readDraftListingSnapshot(chapter, '8', 1_000)).not.toBeNull();
  });

  it('does not keep a listing requested before that account was cleared', () => {
    const requestedAt = draftListingSnapshotEpoch();
    clearDraftListingSnapshotsForUser('7');
    seedDraftListingSnapshot(chapter, '7', list, 1_000, requestedAt);
    seedDraftListingSnapshot(chapter, '8', list, 1_000, requestedAt);
    expect(readDraftListingSnapshot(chapter, '7', 1_000)).toBeNull();
    // Another account's in-flight listing is unaffected.
    expect(readDraftListingSnapshot(chapter, '8', 1_000)).not.toBeNull();

    // A listing requested after the clear is kept again.
    seedDraftListingSnapshot(
      chapter,
      '7',
      list,
      1_000,
      draftListingSnapshotEpoch(),
    );
    expect(readDraftListingSnapshot(chapter, '7', 1_000)).not.toBeNull();
  });

  it('does not keep any listing requested before a full clear', () => {
    const requestedAt = draftListingSnapshotEpoch();
    clearDraftListingSnapshots();
    seedDraftListingSnapshot(chapter, '8', list, 1_000, requestedAt);
    expect(readDraftListingSnapshot(chapter, '8', 1_000)).toBeNull();
  });

  it('keeps the TTL well inside the signed-URL lifetime', () => {
    // #508 SAS URLs live 15 minutes; a URL served from the snapshot must be
    // younger than the TTL, so the TTL must leave ample margin.
    expect(DRAFT_LISTING_SNAPSHOT_TTL_MS).toBeLessThanOrEqual(5 * 60_000);
  });
});
