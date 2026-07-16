import { getBibleTextId, getLatestRecordingForVerse } from './queries';

interface MockDb {
  execute: jest.Mock;
}

let mockDb: MockDb;

jest.mock('./db', () => ({
  getDatabase: () => mockDb,
}));

describe('getBibleTextId', () => {
  it('returns the numeric id when the verse is present', async () => {
    mockDb = {
      execute: jest.fn().mockResolvedValue({ rows: [{ id: 123 }] }),
    };

    const result = await getBibleTextId(1, 41, 14, 3);

    expect(result).toBe(123);
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringMatching(/FROM bible_texts/),
      [1, 41, 14, 3],
    );
  });

  it('returns null when no row matches', async () => {
    mockDb = { execute: jest.fn().mockResolvedValue({ rows: [] }) };
    expect(await getBibleTextId(1, 41, 14, 3)).toBeNull();
  });

  it('returns null when the query throws', async () => {
    mockDb = {
      execute: jest.fn().mockRejectedValue(new Error('boom')),
    };
    expect(await getBibleTextId(1, 41, 14, 3)).toBeNull();
  });
});

describe('getLatestRecordingForVerse', () => {
  it('maps snake_case rows into the Recording shape for a user', async () => {
    mockDb = {
      execute: jest.fn().mockResolvedValue({
        rows: [
          {
            id: 'rec-1',
            bible_text_id: 42,
            user_id: 'user-9',
            project_unit_id: 3,
            chapter_assignment_id: 7,
            local_file_path: '/tmp/rec-1.aac',
            blob_key: null,
            duration_ms: 12000,
            file_size_bytes: 24000,
            take_number: 1,
            is_latest: 1,
            sync_status: 'pending',
            upload_error: null,
            created_at: '2026-07-01T00:00:00.000Z',
            updated_at: '2026-07-01T00:00:00.000Z',
          },
        ],
      }),
    };

    const result = await getLatestRecordingForVerse(42, 'user-9');

    expect(result).toEqual({
      id: 'rec-1',
      bibleTextId: 42,
      userId: 'user-9',
      projectUnitId: 3,
      chapterAssignmentId: 7,
      localFilePath: '/tmp/rec-1.aac',
      blobKey: undefined,
      durationMs: 12000,
      fileSizeBytes: 24000,
      takeNumber: 1,
      isLatest: true,
      syncStatus: 'pending',
      uploadError: undefined,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    });
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringMatching(/FROM recordings/),
      [42, 'user-9'],
    );
  });

  it('returns null when no row exists for the user', async () => {
    mockDb = { execute: jest.fn().mockResolvedValue({ rows: [] }) };
    expect(await getLatestRecordingForVerse(42, 'user-9')).toBeNull();
  });
});
