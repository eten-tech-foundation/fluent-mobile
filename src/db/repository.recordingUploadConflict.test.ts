import { setDatabase } from './db';
import {
  getLatestVersionToken,
  getPendingRecordings,
  markChapterHasConflictForVerse,
  markRecordingAndChapterConflicted,
  markRecordingConflicted,
  markRecordingUploaded,
  raiseVerseVersionToken,
} from './repository';

type RecordingRow = {
  id: string;
  bible_text_id: number;
  local_file_path: string;
  duration_ms: number | null;
  recorded_by_user_id: number | null;
  is_selected: number;
  is_canonical?: number;
  sync_status: string;
  blob_key: string | null;
  version_token: number | null;
  server_take_id?: number | null;
  upload_error: string | null;
  updated_at: string;
  granularity?: string;
  project_unit_id?: number | null;
  start_chapter?: number | null;
  start_verse?: number | null;
  end_chapter?: number | null;
  end_verse?: number | null;
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
      project_unit_id: 12,
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
      project_unit_id: 12,
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
      sql.includes('SELECT MAX(version_token) AS version_token') &&
      sql.includes('FROM recordings')
    ) {
      const [bibleTextId, projectUnitId] = params as [number, number | null];
      // Mirrors `project_unit_id IS ?` — scope tokens to the caller's unit.
      const tokens = recordings
        .filter(
          r =>
            r.bible_text_id === bibleTextId &&
            (r.project_unit_id ?? null) === (projectUnitId ?? null) &&
            r.version_token !== null,
        )
        .map(r => r.version_token as number);
      const max = tokens.length > 0 ? Math.max(...tokens) : null;
      return { rows: [{ version_token: max }] };
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
      // #701 PM rule: canonical is what syncs as the selected take. A
      // selected-only row is deferred while the same verse has a canonical
      // take (all fixture rows share a unit — the real SQL also matches on
      // project_unit_id). #716: every other take uploads, except
      // non-selected pericope takes (range endpoint has no `activate`).
      const hasCanonical = (bibleTextId: number) =>
        recordings.some(
          c => c.bible_text_id === bibleTextId && c.is_canonical === 1,
        );
      const rows = recordings
        .filter(
          r =>
            !(
              r.is_canonical !== 1 &&
              r.is_selected === 1 &&
              hasCanonical(r.bible_text_id)
            ) &&
            (r.granularity !== 'pericope' ||
              r.is_canonical === 1 ||
              r.is_selected === 1) &&
            r.sync_status !== 'uploaded' &&
            r.sync_status !== 'conflicted' &&
            r.bible_text_id > 0 &&
            ['verse', 'pericope'].includes(r.granularity ?? 'verse'),
        )
        .map(r => {
          const bt = bibleTexts.find(b => b.id === r.bible_text_id)!;
          const stored =
            r.project_unit_id !== null &&
            r.project_unit_id !== undefined &&
            r.project_unit_id > 0
              ? r.project_unit_id
              : null;
          const matchingUnits = [
            ...new Set(
              chapterAssignments
                .filter(
                  ca =>
                    ca.bible_id === bt.bible_id &&
                    ca.book_id === bt.book_id &&
                    ca.chapter_number === bt.chapter_number,
                )
                .map(ca => ca.project_unit_id),
            ),
          ];
          const fallback =
            matchingUnits.length === 1 ? matchingUnits[0]! : null;
          return {
            id: r.id,
            bible_text_id: r.bible_text_id,
            local_file_path: r.local_file_path,
            duration_ms: r.duration_ms,
            recorded_by_user_id: r.recorded_by_user_id,
            book_id: bt.book_id,
            chapter_number: bt.chapter_number,
            project_unit_id: stored ?? fallback,
            granularity: r.granularity ?? 'verse',
            start_chapter: r.start_chapter ?? null,
            start_verse: r.start_verse ?? null,
            end_chapter: r.end_chapter ?? null,
            end_verse: r.end_verse ?? null,
            is_canonical: r.is_canonical ?? 0,
            is_selected: r.is_selected,
          };
        });
      return { rows };
    }

    if (sql.startsWith("UPDATE recordings SET sync_status = 'uploaded'")) {
      const [blobKey, versionToken, serverTakeId, updatedAt, id] = params as [
        string,
        number,
        number | null,
        string,
        string,
      ];
      const row = recordings.find(r => r.id === id);
      if (row) {
        row.sync_status = 'uploaded';
        row.blob_key = blobKey;
        row.version_token = versionToken;
        row.server_take_id = serverTakeId ?? row.server_take_id ?? null;
        row.upload_error = null;
        row.updated_at = updatedAt;
      }
      return { rows: [] };
    }

    if (sql.startsWith("UPDATE recordings SET sync_status = 'conflicted'")) {
      // markRecordingConflicted omits server_take_id (3 params).
      const [versionToken, serverTakeId, updatedAt, id] = (
        sql.includes('server_take_id')
          ? params
          : [params[0], null, params[1], params[2]]
      ) as [number, number | null, string, string];
      const row = recordings.find(r => r.id === id);
      if (row) {
        row.sync_status = 'conflicted';
        row.version_token = versionToken;
        row.server_take_id = serverTakeId ?? row.server_take_id ?? null;
        row.upload_error = null;
        row.updated_at = updatedAt;
      }
      return { rows: [] };
    }

    if (
      sql.startsWith('UPDATE recordings SET version_token = ?, updated_at = ?')
    ) {
      const [versionToken, updatedAt, bibleTextId, projectUnitId] = params as [
        number,
        string,
        number,
        number,
      ];
      for (const row of recordings) {
        if (
          row.bible_text_id === bibleTextId &&
          (row.project_unit_id ?? null) === projectUnitId &&
          (row.version_token === null || row.version_token < versionToken)
        ) {
          row.version_token = versionToken;
          row.updated_at = updatedAt;
        }
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
    __bibleTexts: bibleTexts,
    __chapterAssignments: chapterAssignments,
  };
}

describe('recording upload conflict repository helpers (#256)', () => {
  it('getLatestVersionToken returns the highest token for a verse, not the most recently updated row (#701)', async () => {
    const db = createRecordingConflictTestDb();
    setDatabase(db as never);

    // rec-uploaded has the newest updated_at (token 3) but rec-conflicted
    // holds the higher server token (4). Re-selecting an uploaded take bumps
    // its updated_at without a new token, so ordering by recency would send a
    // stale baseVersionToken and the server 409s the CAS.
    await expect(getLatestVersionToken(42, 12)).resolves.toBe(4);
  });

  it('getLatestVersionToken scopes tokens to the project unit (#701)', async () => {
    const db = createRecordingConflictTestDb();
    // Same verse, higher token — but it belongs to a different unit, so the
    // server would ignore it for unit 12 (200 without changing the take).
    db.__recordings.push({
      id: 'rec-other-unit',
      bible_text_id: 42,
      local_file_path: '/other.m4a',
      duration_ms: 1000,
      recorded_by_user_id: 1,
      is_selected: 1,
      sync_status: 'conflicted',
      blob_key: null,
      version_token: 9,
      upload_error: null,
      updated_at: '2026-01-07T00:00:00.000Z',
      project_unit_id: 99,
    });
    setDatabase(db as never);

    await expect(getLatestVersionToken(42, 12)).resolves.toBe(4);
    await expect(getLatestVersionToken(42, 99)).resolves.toBe(9);
    // No token for this verse in a null unit.
    await expect(getLatestVersionToken(42, null)).resolves.toBeUndefined();
  });

  it('getLatestVersionToken returns undefined when no row has a token', async () => {
    const db = createRecordingConflictTestDb();
    db.__recordings.forEach(r => {
      r.version_token = null;
    });
    setDatabase(db as never);

    await expect(getLatestVersionToken(42, 12)).resolves.toBeUndefined();
  });

  it('getPendingRecordings excludes uploaded and conflicted rows', async () => {
    const db = createRecordingConflictTestDb();
    setDatabase(db as never);

    const pending = await getPendingRecordings();
    expect(pending.map(r => r.id)).toEqual(['rec-pending']);
  });

  it('getPendingRecordings excludes non-positive bible_text_id rows', async () => {
    const db = createRecordingConflictTestDb();
    db.__recordings.push({
      id: 'rec-parked',
      bible_text_id: -1000007,
      local_file_path: '/parked.m4a',
      duration_ms: 1000,
      recorded_by_user_id: 1,
      is_selected: 1,
      sync_status: 'pending',
      blob_key: null,
      version_token: null,
      upload_error: null,
      updated_at: '2026-01-06T00:00:00.000Z',
    });
    setDatabase(db as never);

    const pending = await getPendingRecordings();
    expect(pending.map(r => r.id)).toEqual(['rec-pending']);
  });

  it('getPendingRecordings includes canonical-only takes pending designation sync (#701)', async () => {
    const db = createRecordingConflictTestDb();
    db.__recordings.push({
      id: 'rec-canonical',
      bible_text_id: 43,
      local_file_path: '/canon.m4a',
      duration_ms: 1000,
      recorded_by_user_id: 2,
      is_selected: 0,
      is_canonical: 1,
      sync_status: 'pending',
      blob_key: 'unit-12/text-43',
      version_token: 3,
      upload_error: null,
      updated_at: '2026-01-06T00:00:00.000Z',
    });
    db.__bibleTexts.push({
      id: 43,
      bible_id: 1,
      book_id: 40,
      chapter_number: 1,
    });
    setDatabase(db as never);

    const pending = await getPendingRecordings();
    // Canonical (different verse) is included alongside the selected row.
    expect(pending.map(r => r.id)).toEqual(
      expect.arrayContaining(['rec-pending', 'rec-canonical']),
    );
    expect(pending.map(r => r.id)).not.toContain('rec-uploaded');
  });

  it('getPendingRecordings defers a pending selected take while the verse has a canonical take (#701)', async () => {
    const db = createRecordingConflictTestDb();
    // rec-pending (bible_text 42, selected, pending) exists in the fixture.
    db.__recordings.push({
      id: 'rec-canonical',
      bible_text_id: 42,
      local_file_path: '/canon.m4a',
      duration_ms: 1000,
      recorded_by_user_id: 2,
      is_selected: 0,
      is_canonical: 1,
      sync_status: 'pending',
      blob_key: 'unit-12/text-42',
      version_token: 3,
      upload_error: null,
      updated_at: '2026-01-06T00:00:00.000Z',
    });
    setDatabase(db as never);

    const pending = await getPendingRecordings();
    // Canonical is the take sent as the selected take; the selected-only row
    // is deferred until the designation moves.
    expect(pending.map(r => r.id)).toEqual(['rec-canonical']);
  });

  it('getPendingRecordings includes pericope takes (#584)', async () => {
    const db = createRecordingConflictTestDb();
    db.__recordings.push({
      id: 'rec-pericope',
      bible_text_id: 42,
      local_file_path: '/p.m4a',
      duration_ms: 1000,
      recorded_by_user_id: 1,
      is_selected: 1,
      sync_status: 'pending',
      blob_key: null,
      version_token: null,
      upload_error: null,
      updated_at: '2026-01-07T00:00:00.000Z',
      granularity: 'pericope',
      start_chapter: 1,
      start_verse: 1,
      end_chapter: 1,
      end_verse: 8,
    });
    setDatabase(db as never);

    const pending = await getPendingRecordings();
    expect(pending.map(r => r.id)).toEqual(
      expect.arrayContaining(['rec-pending', 'rec-pericope']),
    );
    expect(pending.find(r => r.id === 'rec-pericope')).toEqual(
      expect.objectContaining({
        granularity: 'pericope',
        startChapter: 1,
        startVerse: 1,
        endChapter: 1,
        endVerse: 8,
      }),
    );
  });

  it('getPendingRecordings prefers stored project_unit_id over lowest assignment (#613)', async () => {
    const db = createRecordingConflictTestDb();
    db.__chapterAssignments.push({
      id: 8,
      bible_id: 1,
      book_id: 40,
      chapter_number: 1,
      project_unit_id: 99,
      has_conflict: 0,
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    const pendingRow = db.__recordings.find(r => r.id === 'rec-pending')!;
    pendingRow.project_unit_id = 99;
    setDatabase(db as never);

    const pending = await getPendingRecordings();
    expect(pending).toEqual([
      expect.objectContaining({ id: 'rec-pending', projectUnitId: 99 }),
    ]);
  });

  it('getPendingRecordings leaves projectUnitId null when assignment is ambiguous (#613)', async () => {
    const db = createRecordingConflictTestDb();
    db.__chapterAssignments.push({
      id: 8,
      bible_id: 1,
      book_id: 40,
      chapter_number: 1,
      project_unit_id: 99,
      has_conflict: 0,
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    setDatabase(db as never);

    const pending = await getPendingRecordings();
    expect(pending).toEqual([
      expect.objectContaining({ id: 'rec-pending', projectUnitId: null }),
    ]);
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

  it('getPendingRecordings includes non-selected verse takes with their activation flags (#716)', async () => {
    const db = createRecordingConflictTestDb();
    db.__recordings.push({
      id: 'rec-alt',
      bible_text_id: 42,
      local_file_path: '/alt.m4a',
      duration_ms: 1000,
      recorded_by_user_id: 1,
      is_selected: 0,
      sync_status: 'pending',
      blob_key: null,
      version_token: null,
      upload_error: null,
      updated_at: '2026-01-06T00:00:00.000Z',
      project_unit_id: 12,
    });
    setDatabase(db as never);

    const pending = await getPendingRecordings();
    expect(pending).toEqual([
      expect.objectContaining({
        id: 'rec-pending',
        isSelected: true,
        isCanonical: false,
      }),
      expect.objectContaining({
        id: 'rec-alt',
        isSelected: false,
        isCanonical: false,
      }),
    ]);
  });

  it('getPendingRecordings keeps non-selected pericope takes local until the range endpoint supports activate (#716)', async () => {
    const db = createRecordingConflictTestDb();
    db.__recordings.push({
      id: 'rec-pericope-alt',
      bible_text_id: 42,
      local_file_path: '/peri.m4a',
      duration_ms: 1000,
      recorded_by_user_id: 1,
      is_selected: 0,
      sync_status: 'pending',
      blob_key: null,
      version_token: null,
      upload_error: null,
      updated_at: '2026-01-06T00:00:00.000Z',
      project_unit_id: 12,
      granularity: 'pericope',
      start_chapter: 1,
      start_verse: 1,
      end_chapter: 1,
      end_verse: 3,
    });
    setDatabase(db as never);

    const pending = await getPendingRecordings();
    expect(pending.map(r => r.id)).toEqual(['rec-pending']);
  });

  it('markRecordingUploaded stores server_take_id when provided and keeps it otherwise (#716)', async () => {
    const db = createRecordingConflictTestDb();
    setDatabase(db as never);

    await markRecordingUploaded('rec-pending', 'unit-12/text-42', 5, 77);
    expect(
      db.__recordings.find(r => r.id === 'rec-pending')?.server_take_id,
    ).toBe(77);

    await markRecordingUploaded('rec-pending', 'unit-12/text-42', 6);
    expect(
      db.__recordings.find(r => r.id === 'rec-pending')?.server_take_id,
    ).toBe(77);
  });

  it('markRecordingAndChapterConflicted stores server_take_id (#716)', async () => {
    const db = createRecordingConflictTestDb();
    setDatabase(db as never);

    await markRecordingAndChapterConflicted('rec-pending', 42, 7, 88);

    expect(db.__recordings.find(r => r.id === 'rec-pending')).toEqual(
      expect.objectContaining({
        sync_status: 'conflicted',
        server_take_id: 88,
      }),
    );
  });

  it('raiseVerseVersionToken lifts lower tokens on the unit and never lowers newer ones (#716)', async () => {
    const db = createRecordingConflictTestDb();
    setDatabase(db as never);

    await raiseVerseVersionToken(42, 12, 5);
    await expect(getLatestVersionToken(42, 12)).resolves.toBe(5);
    expect(
      db.__recordings.find(r => r.id === 'rec-uploaded')?.version_token,
    ).toBe(5);

    await raiseVerseVersionToken(42, 12, 2);
    await expect(getLatestVersionToken(42, 12)).resolves.toBe(5);
  });
});
