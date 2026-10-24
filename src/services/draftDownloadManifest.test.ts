import {
  readDraftDownloadManifest,
  writeDraftDownloadManifest,
  writeDraftDownloadPurgeTombstone,
} from './draftDownloadManifest';
import {
  resetFileSystemMock,
  writeAsStringAsync,
} from '../test/mocks/expo-file-system';

describe('draftDownloadManifest identity scoping', () => {
  beforeEach(() => {
    resetFileSystemMock();
  });

  it('preserves units on purge tombstone for owned-id retry', async () => {
    const identity = {
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'peer_check' as const,
    };
    await writeDraftDownloadManifest({
      ...identity,
      projectUnitId: 12,
      bibleId: 1,
      bookId: 41,
      bookCode: 'MRK',
      chapterNumber: 1,
      units: [
        {
          bibleTextId: 3401,
          verseNumber: 1,
          conflictStatus: 'clean',
          activeTakeId: 10,
          contentHash: 'abc',
          resourceId: 'draft-audio-9-3401-t10-abc',
          coverage: null,
        },
      ],
      purgeGeneration: 0,
      purged: false,
    });
    const previous = await readDraftDownloadManifest(identity);
    await writeDraftDownloadPurgeTombstone(identity, previous);
    const tombstone = await readDraftDownloadManifest(identity);
    expect(tombstone?.purged).toBe(true);
    expect(tombstone?.purgeGeneration).toBe(1);
    expect(tombstone?.units).toEqual([
      expect.objectContaining({
        resourceId: 'draft-audio-9-3401-t10-abc',
      }),
    ]);
  });

  it('rejects manifests with forged draft-audio for another assignment', async () => {
    const identity = {
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'peer_check' as const,
    };
    await writeAsStringAsync(
      'file:///mock-document/downloads/1/draft-manifest-u7-a9-peer_check.json',
      JSON.stringify({
        ...identity,
        projectUnitId: 12,
        bibleId: 1,
        bookId: 41,
        bookCode: 'MRK',
        chapterNumber: 1,
        units: [
          {
            bibleTextId: 3401,
            verseNumber: 1,
            conflictStatus: 'clean',
            activeTakeId: 10,
            contentHash: 'abc',
            resourceId: 'draft-audio-999-3401-t10-abc',
            coverage: null,
          },
        ],
        purgeGeneration: 0,
        purged: false,
      }),
    );
    await expect(readDraftDownloadManifest(identity)).resolves.toBeNull();
  });

  it('scopes path by userId+projectId+assignment+role and rejects mismatches', async () => {
    await writeDraftDownloadManifest({
      chapterAssignmentId: 9,
      projectId: 1,
      userId: 7,
      role: 'observer',
      projectUnitId: 12,
      bibleId: 1,
      bookId: 41,
      bookCode: 'MRK',
      chapterNumber: 1,
      units: [],
      purgeGeneration: 0,
      purged: false,
    });

    const ok = await readDraftDownloadManifest({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'observer',
    });
    expect(ok?.userId).toBe(7);

    const otherUser = await readDraftDownloadManifest({
      projectId: 1,
      userId: 99,
      chapterAssignmentId: 9,
      role: 'observer',
    });
    expect(otherUser).toBeNull();

    // Tamper file written under user 7 path with another userId body.
    await writeAsStringAsync(
      'file:///mock-document/downloads/1/draft-manifest-u7-a9-observer.json',
      JSON.stringify({
        chapterAssignmentId: 9,
        projectId: 1,
        userId: 99,
        role: 'observer',
        projectUnitId: 12,
        bibleId: 1,
        bookId: 41,
        bookCode: 'MRK',
        chapterNumber: 1,
        units: [],
        purgeGeneration: 0,
        purged: false,
      }),
    );
    const mismatched = await readDraftDownloadManifest({
      projectId: 1,
      userId: 7,
      chapterAssignmentId: 9,
      role: 'observer',
    });
    expect(mismatched).toBeNull();
  });
});
