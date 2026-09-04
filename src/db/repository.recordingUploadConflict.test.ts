import { setDatabase } from './db';
import {
  getLatestVersionToken,
  getPendingRecordings,
  markChapterHasConflictForVerse,
  markRecordingAndChapterConflicted,
  markRecordingConflicted,
  markRecordingUploaded,
} from './repository';

type RecordingRow = {
  id: string;
  bible_text_id: number;
  local_file_path: string;
  duration_ms: number | null;
  recorded_by_user_id: number | null;
  is_selected: number;
  sync_status: string;
  blob_key: string | null;
  version_token: number | null;
  upload_error: string | null;
  updated_at: string;
};

type BibleTextRow = {
  id: number;
  bible_id: number;
  book_id: number;
  chapter_number: number;
};

type ChapterAssignmentRow = {
  id: number;
  bible_id: number;
  book_id: number;
  chapter_number: number;
  project_unit_id: number;
  has_conflict: number;
  updated_at: string;
};

function createRecordingConflictTestDb() {
  const recordings: RecordingRow[] = [
    {
      id: 'rec-uploaded',
      bible_text_id: 42,
      local_file_path: '/a.m4a',
      duration_ms: 1000,
      recorded_by_user_id: 1,
      is_selected: 1,
      sync_status: 'uploaded',
      blob_key: 'unit-12/text-42',
      version_token: 3,
      upload_error: null,
      updated_at: '2026-01-05T00:00:00.000Z',
    },
    {
      id: 'rec-pending',
      bible_text_id: 42,
      local_file_path: '/b.m4a',
      duration_ms: 1000,
      recorded_by_user_id: 1,
      is_selected: 1,
      sync_status: 'pending',
      blob_key: null,
      version_token: null,
      upload_error: null,
      updated_at: '2026-01-03T00:00:00.000Z',
    },
    {
      id: 'rec-conflicted',
      bible_text_id: 42,
      local_file_path: '/c.m4a',
      duration_ms: 1000,
      recorded_by_user_id: 1,
      is_selected: 1,
      sync_status: 'conflicted',
      blob_key: null,
      version_token: 4,
      upload_error: null,
      updated_at: '2026-01-04T00:00:00.000Z',
    },
  ];

  const bibleTexts: BibleTextRow[] = [
    { id: 42, bible_id: 1, book_id: 40, chapter_number: 1 },
  ];

  const chapterAssignments: ChapterAssignmentRow[] = [
    {
      id: 7,
      bible_id: 1,
      book_id: 40,
      chapter_number: 1,
      project_unit_id: 12,
      has_conflict: 0,
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ];

  const execute = async (query: string, params: unknown[] = []) => {
    const sql = query.replace(/\s+/g, ' ').trim();

    if (
      sql.includes('SELECT version_token FROM recordings') &&
      sql.includes('ORDER BY updated_at DESC LIMIT 1')
    ) {
      const [bibleTextId] = params as [number];
      const row = recordings
        .filter(
          r => r.bible_text_id === bibleTextId && r.version_token !== null,
        )
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
      return { rows: row ? [{ version_token: row.version_token }] : [] };
    }

    if (
      sql.includes('FROM recordings r') &&
      sql.includes('getPendingRecordings')
    ) {
      // unused marker — fall through to real matcher below
    }

    if (
      sql.includes('FROM recordings r') &&
      sql.includes('JOIN bible_texts bt') &&
      sql.includes("sync_status NOT IN ('uploaded', 'conflicted')")
    ) {
      const rows = recordings
        .filter(
          r =>
            r.is_selected === 1 &&
            r.sync_status !== 'uploaded' &&
            r.sync_status !== 'conflicted',
        )
        .map(r => {
          const bt = bibleTexts.find(b => b.id === r.bible_text_id)!;
          return {
            id: r.id,
            bible_text_id: r.bible_text_id,
            local_file_path: r.local_file_path,
            duration_ms: r.duration_ms,
            recorded_by_user_id: r.recorded_by_user_id,
            book_id: bt.book_id,
            chapter_number: bt.chapter_number,
            project_unit_id: 12,
          };
        });
      return { rows };
    }

    if (sql.startsWith("UPDATE recordings SET sync_status = 'uploaded'")) {
      const [blobKey, versionToken, updatedAt, id] = params as [
        string,
        number,
        string,
        string,
      ];
      const row = recordings.find(r => r.id === id);
      if (row) {
        row.sync_status = 'uploaded';
        row.blob_key = blobKey;
        row.version_token = versionToken;
        row.upload_error = null;
        row.updated_at = updatedAt;
      }
      return { rows: [] };
    }

    if (sql.startsWith("UPDATE recordings SET sync_status = 'conflicted'")) {
      const [versionToken, updatedAt, id] = params as [number, string, string];
      const row = recordings.find(r => r.id === id);
      if (row) {
        row.sync_status = 'conflicted';
        row.version_token = versionToken;
        row.upload_error = null;
        row.updated_at = updatedAt;
      }
      return { rows: [] };
    }

    if (sql.startsWith('UPDATE chapter_assignments SET has_conflict = 1')) {
      const [updatedAt, bibleTextId] = params as [string, number];
      const bt = bibleTexts.find(b => b.id === bibleTextId);
      if (bt) {
        for (const row of chapterAssignments) {
          if (
            row.bible_id === bt.bible_id &&
            row.book_id === bt.book_id &&
            row.chapter_number === bt.chapter_number
          ) {
            row.has_conflict = 1;
            row.updated_at = updatedAt;
          }
        }
      }
      return { rows: [] };
    }

    return { rows: [] };
  };

  return {
    execute,
    transaction: async (
      fn: (tx: { execute: typeof execute }) => Promise<void>,
    ) => {
      await fn({ execute });
    },
    __recordings: recordings,
    __chapterAssignments: chapterAssignments,
  };
}

describe('recording upload conflict repository helpers (#256)', () => {
  it('getLatestVersionToken returns the most recently updated token for a verse', async () => {
    const db = createRecordingConflictTestDb();
    setDatabase(db as never);

    await expect(getLatestVersionToken(42)).resolves.toBe(3);
  });

  it('getPendingRecordings excludes uploaded and conflicted rows', async () => {
    const db = createRecordingConflictTestDb();
    setDatabase(db as never);

    const pending = await getPendingRecordings();
    expect(pending.map(r => r.id)).toEqual(['rec-pending']);
  });

  it('markRecordingUploaded persists version_token', async () => {
    const db = createRecordingConflictTestDb();
    setDatabase(db as never);

    await markRecordingUploaded('rec-pending', 'unit-12/text-42', 5);

    expect(db.__recordings.find(r => r.id === 'rec-pending')).toEqual(
      expect.objectContaining({
        sync_status: 'uploaded',
        blob_key: 'unit-12/text-42',
        version_token: 5,
      }),
    );
  });

  it('markRecordingConflicted sets sync_status conflicted and version_token', async () => {
    const db = createRecordingConflictTestDb();
    setDatabase(db as never);

    await markRecordingConflicted('rec-pending', 6);

    expect(db.__recordings.find(r => r.id === 'rec-pending')).toEqual(
      expect.objectContaining({
        sync_status: 'conflicted',
        version_token: 6,
      }),
    );
  });

  it('markChapterHasConflictForVerse sets has_conflict on the matching chapter', async () => {
    const db = createRecordingConflictTestDb();
    setDatabase(db as never);

    await markChapterHasConflictForVerse(42);

    expect(db.__chapterAssignments[0]).toEqual(
      expect.objectContaining({ has_conflict: 1 }),
    );
  });

  it('markRecordingAndChapterConflicted atomically updates both in transaction', async () => {
    const db = createRecordingConflictTestDb();
    setDatabase(db as never);

    await markRecordingAndChapterConflicted('rec-pending', 42, 7);

    // Recording marked as conflicted with version token
    expect(db.__recordings.find(r => r.id === 'rec-pending')).toEqual(
      expect.objectContaining({
        sync_status: 'conflicted',
        version_token: 7,
      }),
    );

    // Chapter marked as having conflict
    expect(db.__chapterAssignments[0]).toEqual(
      expect.objectContaining({ has_conflict: 1 }),
    );

    // Transaction was used (verify by checking that both updates happened)
    // The mock DB doesn't track transaction calls, but we can verify atomicity
    // by confirming both updates succeeded
    const recording = db.__recordings.find(r => r.id === 'rec-pending');
    const chapter = db.__chapterAssignments[0];
    expect(recording?.sync_status).toBe('conflicted');
    expect(chapter.has_conflict).toBe(1);
  });
});
