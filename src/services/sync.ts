import { FluentAPI } from './api';
import {
  insertUser,
  insertLanguages,
  insertBooks,
  insertBibles,
  insertProjects,
  insertChapterAssignments,
  insertProjectUnits,
  insertBibleTexts,
  getChaptersToSync,
} from '../db/repository';
import { logger } from '../utils/logger';
import { getDatabase } from '../db/db';
import { ApiBook, ApiVerse } from '../types/api/types';
import {
  setUserSync,
  setSyncCount,
  setLastSyncedAt,
  KV_KEYS,
} from '../services/storage';

const log = logger.create('SyncService');
const db = getDatabase();

export async function syncUser(email: string) {
  try {
    log.info('Syncing user...');

    const user = await FluentAPI.getUserByEmail(email);

    if (!user?.id) {
      throw new Error('Invalid user response');
    }

    await insertUser(user);

    setUserSync(String(user.id), user.email);
    log.info('User synced', { email: user.email });
    return user;
  } catch (error) {
    log.error('User sync failed', { error });
    throw error;
  }
}

export async function syncMasterData() {
  try {
    log.info('Sync started');

    const [languages, books, bibles] = await Promise.all([
      FluentAPI.getLanguages(),
      FluentAPI.getBooks(),
      FluentAPI.getBibles(),
    ]);

    await insertLanguages(languages);
    await insertBooks(books);
    await insertBibles(bibles);

    log.info('Sync completed');
  } catch (error) {
    log.error('Sync failed', { error });
  }
}

export async function syncProjects(userId: number, email: string) {
  try {
    log.info('Syncing projects...');

    const projects = await FluentAPI.getUserProjects(userId, email);

    await insertProjects(projects);
    const result = await db.execute('SELECT COUNT(*) as count FROM projects');
    const totalProjectsCount = result.rows?.[0]?.count || 0;
    setSyncCount(KV_KEYS.SYNC_COUNT_PROJECTS, Number(totalProjectsCount));

    log.info('Projects synced', { count: projects.length });
  } catch (error) {
    log.error('Project sync failed', { error });
  }
}

export async function syncChapterAssignments(userId: number, email: string) {
  try {
    log.info('Syncing chapter assignments...');

    const response = await FluentAPI.getChapterAssignments(userId, email);

    const allAssignments = [
      ...(response?.assignedChapters || []),
      ...(response?.peerCheckChapters || []),
    ];

    if (allAssignments.length > 0) {
      await insertProjectUnits(allAssignments);

      await insertChapterAssignments(allAssignments);

      const result = await db.execute(
        'SELECT COUNT(*) as count FROM chapter_assignments',
      );
      const totalChaptersCount = result.rows?.[0]?.count || 0;
      setSyncCount(KV_KEYS.SYNC_COUNT_CHAPTERS, Number(totalChaptersCount));

      log.info('Chapter assignments synced', {
        apiCount: allAssignments.length,
        totalInDb: totalChaptersCount,
      });
    }
  } catch (error) {
    log.error('Chapter assignment sync failed', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      raw: error,
    });
  }
}

export async function syncBibleTexts(email: string) {
  try {
    log.info('Syncing bible texts...');

    const bibleGroups = await getChaptersToSync();

    if (bibleGroups.size === 0) {
      log.info('No chapters to sync');
      setSyncCount(KV_KEYS.SYNC_COUNT_BIBLES, 0);
      return 0;
    }

    let totalTextsInserted = 0;

    for (const [bibleId, chapters] of bibleGroups) {
      try {
        log.info('Syncing chapters for bible', {
          bibleId,
          chapterCount: chapters.length,
        });

        const response: ApiBook[] = await FluentAPI.getBibleTexts(
          bibleId,
          chapters,
          email,
        );

        if (response && Array.isArray(response)) {
          const textsWithBibleId = response.map((book: ApiBook) => ({
            bookId: book.bookId,
            chapterNumber: book.chapterNumber,
            verses: book.verses.map((verse: ApiVerse) => ({
              bible_id: bibleId,
              book_id: book.bookId,
              chapter_number: book.chapterNumber,
              verse_number: verse.verseNumber,
              text: verse.text,
            })),
          }));

          await insertBibleTexts(textsWithBibleId);
          totalTextsInserted += response.length;
          log.info('Synced books for bible', {
            bibleId,
            count: response.length,
          });
        }
      } catch (error) {
        log.error(`Failed to sync texts for bible ${bibleId}:`, { error });
        continue;
      }
    }
    const result = await db.execute(
      'SELECT COUNT(DISTINCT bible_id) as count FROM bible_texts',
    );
    const uniqueBiblesCount = result.rows?.[0]?.count || 0;
    setSyncCount(KV_KEYS.SYNC_COUNT_BIBLES, Number(uniqueBiblesCount));

    log.info('Bible texts sync completed', {
      textsInserted: totalTextsInserted,
      uniqueBiblesInDb: uniqueBiblesCount,
    });
  } catch (error) {
    log.error('Bible texts sync failed', { error });
  }
}

export async function syncAllData(email: string) {
  log.info('Starting full sync...');

  try {
    const user = await syncUser(email);

    await syncMasterData();

    await syncProjects(user.id, email);

    await syncChapterAssignments(user.id, email);

    try {
      await syncBibleTexts(email);
    } catch (e) {
      log.warn('Bible text sync failed, continuing...', { error: e });
    }
    const now = new Date().toISOString();
    setLastSyncedAt(now);

    log.info('Full sync completed successfully!', { timestamp: now });
  } catch (error) {
    log.error('Full sync failed', { error });
    throw error;
  }
}
