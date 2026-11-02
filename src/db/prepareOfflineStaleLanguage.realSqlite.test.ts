import type { DB } from '@op-engineering/op-sqlite';
import { setDatabase } from './db';
import { insertMasterData } from './repository';
import { getPrepareOfflineProjectContext } from './queries.prepareOffline';
import {
  CURRENT_SCHEMA_VERSION,
  getUserVersion,
  runMigrations,
} from './migrations';
import { createRealSqliteDb, isNodeSqliteAvailable } from '../test/realSqlite';
import { mapApiLanguage } from '../services/mapApiLanguage';

const canUseRealSqlite = isNodeSqliteAvailable();

async function seedStaleQaFixture(db: DB): Promise<void> {
  // Present stale rows matching runtime evidence: language ids correct on the
  // project, but local ISO / bible.language_id diverge from QA server.
  await db.execute(
    `INSERT INTO languages (id, lang_name, lang_code_iso_639_3, script_direction)
     VALUES (?, ?, ?, ?)`,
    [5, 'Stale Source', 'gjk', 'ltr'],
  );
  await db.execute(
    `INSERT INTO languages (id, lang_name, lang_code_iso_639_3, script_direction)
     VALUES (?, ?, ?, ?)`,
    [2336, 'Stale Target', 'hil', 'ltr'],
  );
  await db.execute(
    `INSERT INTO languages (id, lang_name, lang_code_iso_639_3, script_direction)
     VALUES (?, ?, ?, ?)`,
    [1807, 'Orphan Bible Lang', 'eng', 'ltr'],
  );
  await db.execute(
    `INSERT INTO bibles (id, language_id, name, abbreviation) VALUES (?, ?, ?, ?)`,
    [167, 1807, 'Stale Bible', 'STB'],
  );
  await db.execute(
    `INSERT INTO projects (
      id, name, source_language_id, target_language_id, is_active, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [1, 'Project', 5, 2336, 1, 'not_assigned', '2026-01-01'],
  );
}

(canUseRealSqlite ? describe : describe.skip)(
  'Prepare Offline stale language/bible catalogue upsert (real SQLite)',
  () => {
    let db: DB;

    beforeEach(async () => {
      db = createRealSqliteDb();
      setDatabase(db);
      await runMigrations(db);
      await expect(getUserVersion(db)).resolves.toBe(CURRENT_SCHEMA_VERSION);
      await seedStaleQaFixture(db);
    });

    afterEach(async () => {
      setDatabase(null as unknown as DB);
      if (db) {
        await db.close();
      }
    });

    it('fails before seed: project sourceLanguageId 5 still joins stale local gjk', async () => {
      await expect(getPrepareOfflineProjectContext(1)).resolves.toEqual({
        projectId: 1,
        sourceLanguageCode: 'gjk',
      });
      const bible = await db.execute(
        'SELECT language_id FROM bibles WHERE id = ?',
        [167],
      );
      expect(bible.rows[0]).toEqual({ language_id: 1807 });
    });

    it('passes after #679-style insertMasterData upsert from server authority', async () => {
      await expect(getPrepareOfflineProjectContext(1)).resolves.toEqual({
        projectId: 1,
        sourceLanguageCode: 'gjk',
      });

      // Same path seedLanguageParentsForProjects / seedAssignmentMasterParents use.
      await insertMasterData(
        [
          mapApiLanguage({
            id: 5,
            langName: 'English',
            langCodeIso6393: 'eng',
          }),
          mapApiLanguage({
            id: 2336,
            langName: 'Hindi',
            langCodeIso6393: 'hin',
          }),
        ],
        [],
        [
          {
            id: 167,
            languageId: 5,
            name: 'Server Bible',
            abbreviation: 'SVB',
          },
        ],
      );

      await expect(getPrepareOfflineProjectContext(1)).resolves.toEqual({
        projectId: 1,
        sourceLanguageCode: 'eng',
      });
      const target = await db.execute(
        'SELECT lang_code_iso_639_3 FROM languages WHERE id = ?',
        [2336],
      );
      expect(target.rows[0]).toEqual({ lang_code_iso_639_3: 'hin' });
      const bible = await db.execute(
        'SELECT language_id FROM bibles WHERE id = ?',
        [167],
      );
      expect(bible.rows[0]).toEqual({ language_id: 5 });

      // Project FK identifiers and human-work tables are untouched.
      const project = await db.execute(
        'SELECT source_language_id, target_language_id FROM projects WHERE id = ?',
        [1],
      );
      expect(project.rows[0]).toEqual({
        source_language_id: 5,
        target_language_id: 2336,
      });
    });
  },
);
