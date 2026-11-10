import type { DB } from '@op-engineering/op-sqlite';
import { createRealSqliteDb } from '../test/realSqlite';
import { runMigrations } from './migrations';
import { selectRecordingTake, setCanonicalTake } from './recordingsRepository';
import {
  getPendingRecordings,
  markRecordingUploaded,
  setRecordingSyncStatus,
} from './repository';

let mockDb: DB;
jest.mock('./db', () => ({ getDatabase: () => mockDb }));
jest.mock('../services/storage', () => ({ getActiveUserId: () => '7' }));
jest.mock('../services/recordingDataEvents', () => ({
  emitRecordingDataChanged: jest.fn(),
}));

describe('durable upload operation identity against real SQLite (#886)', () => {
  beforeEach(async () => {
    mockDb = createRealSqliteDb();
    await runMigrations(mockDb);
    await mockDb.execute(`
      INSERT INTO users(id, email) VALUES (7, 'fixture@example.test');
      INSERT INTO languages(id, lang_name, script_direction) VALUES (1, 'Fixture', 'ltr');
      INSERT INTO books(id, code, eng_display_name) VALUES (40, 'MAT', 'Matthew');
      INSERT INTO bibles(id, language_id, name, abbreviation) VALUES (1, 1, 'Fixture', 'FIX');
      INSERT INTO projects(id, name, source_language_id, target_language_id, is_active, status, updated_at)
        VALUES (1, 'Fixture', 1, 1, 1, 'not_assigned', '2026-01-01');
      INSERT INTO project_units(id, project_id, status, name) VALUES (12, 1, 'not_started', '');
      INSERT INTO bible_texts(id, bible_id, book_id, chapter_number, verse_number, text)
        VALUES (42, 1, 40, 1, 1, 'Fixture');
      INSERT INTO recordings(id, bible_text_id, recorded_by_user_id, project_unit_id,
        local_file_path, is_selected, sync_status, start_chapter, start_verse,
        end_chapter, end_verse, created_at, updated_at)
        VALUES ('old', 42, 7, 12, 'file:///old.m4a', 0, 'pending', 1, 1, 1, 1, '2026-01-01', '2026-01-01');
    `);
  });
  afterEach(async () => {
    await mockDb.close();
  });

  it.each(['pending', 'uploaded'])(
    'an older receipt cannot consume a new selection after %s',
    async initialStatus => {
      if (initialStatus === 'uploaded') {
        await expect(
          markRecordingUploaded('old', 'accepted', 2, 9, 0, {
            bibleTextId: 42,
            projectUnitId: 12,
            localFilePath: 'file:///old.m4a',
            recordedByUserId: 7,
          }),
        ).resolves.toBe(true);
      }
      await selectRecordingTake('old');
      const pending = await getPendingRecordings();
      expect(pending[0]).toMatchObject({
        id: 'old',
        isSelected: true,
        uploadIntentVersion: 1,
      });
      await expect(
        markRecordingUploaded('old', 'accepted', 2, 9, 0, {
          bibleTextId: 42,
          projectUnitId: 12,
          localFilePath: 'file:///old.m4a',
          recordedByUserId: 7,
        }),
      ).resolves.toBe(false);
      const row = (
        await mockDb.execute('SELECT * FROM recordings WHERE id = ?', ['old'])
      ).rows[0];
      expect(row).toMatchObject({
        sync_status: 'pending',
        upload_intent_version: 1,
        blob_key: 'accepted',
      });
      await expect(
        markRecordingUploaded('old', 'accepted', 3, 9, 1),
      ).resolves.toBe(true);
    },
  );

  it('migrates a version-24 row without losing its pending take or selections', async () => {
    await mockDb.execute('DROP TRIGGER recordings_upload_intent_changed');
    await mockDb.execute(
      'ALTER TABLE recordings DROP COLUMN upload_intent_version',
    );
    await mockDb.execute('PRAGMA user_version = 24');
    expect(
      (await mockDb.execute('PRAGMA table_info(recordings)')).rows.map(
        row => row.name,
      ),
    ).not.toContain('upload_intent_version');
    await runMigrations(mockDb);
    expect((await getPendingRecordings())[0]).toMatchObject({
      id: 'old',
      uploadIntentVersion: 0,
    });
    await selectRecordingTake('old');
    expect((await getPendingRecordings())[0]).toMatchObject({
      id: 'old',
      uploadIntentVersion: 1,
    });
  });

  it('increments canonical intent but not retry/status bookkeeping', async () => {
    await setCanonicalTake('old');
    await setRecordingSyncStatus('old', 'uploading', 1);
    await setRecordingSyncStatus('old', 'pending', 1);
    const row = (
      await mockDb.execute('SELECT * FROM recordings WHERE id = ?', ['old'])
    ).rows[0];
    expect(row.upload_intent_version).toBe(1);
    await expect(
      markRecordingUploaded('old', 'accepted', 2, 9, 0, {
        bibleTextId: 42,
        projectUnitId: 12,
        localFilePath: 'file:///old.m4a',
        recordedByUserId: 7,
      }),
    ).resolves.toBe(false);
    await expect(setRecordingSyncStatus('old', 'failed', 0)).resolves.toBe(
      false,
    );
    expect(
      (
        await mockDb.execute(
          'SELECT sync_status FROM recordings WHERE id = ?',
          ['old'],
        )
      ).rows[0].sync_status,
    ).toBe('pending');
  });
});
