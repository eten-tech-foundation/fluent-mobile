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
  it('rejects late validation and scripture writes from a superseded or purged session', async () => {
    const manifest = {
      chapterAssignmentId: 9,
      projectId: 1,
      userId: 7,
      role: 'observer' as const,
      projectUnitId: 12,
      bibleId: 1,
      bookId: 41,
      bookCode: 'MRK',
      chapterNumber: 1,
      units: [],
      purgeGeneration: 0,
      purged: false,
      audioValidationId: 'old',
      audioValidation: 'pending' as const,
    };
    await writeDraftDownloadManifest(manifest, { newSession: true });
    await writeDraftDownloadManifest(
      { ...manifest, audioValidationId: 'new' },
      { newSession: true },
    );
    await writeDraftDownloadManifest({
      ...manifest,
      audioValidation: 'confirmed',
    });
    expect(await readDraftDownloadManifest(manifest)).toMatchObject({
      audioValidationId: 'new',
      audioValidation: 'pending',
    });
    const current = (await readDraftDownloadManifest(manifest))!;
    await writeDraftDownloadManifest({
      ...current,
      audioValidation: 'confirmed',
    });
    await writeDraftDownloadManifest({
      ...current,
      sourceScriptureError: 'retry',
    });
    expect(await readDraftDownloadManifest(manifest)).toMatchObject({
      audioValidation: 'confirmed',
    });
    await writeDraftDownloadPurgeTombstone(manifest, current);
    await expect(
      writeDraftDownloadManifest(current, { newSession: true }),
    ).resolves.toBeNull();
    await writeDraftDownloadManifest({
      ...current,
      audioValidation: 'confirmed',
    });
    expect(await readDraftDownloadManifest(manifest)).toMatchObject({
      purged: true,
    });
  });
});
