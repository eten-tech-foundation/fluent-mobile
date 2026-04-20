import { FluentAPI } from './fluentApi';
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
import { ApiBook, ApiVerse } from '../types/apiTypes';

const log = logger.create('SyncService');

export async function syncUser(email: string) {
  try {
    log.info('Syncing user...');

    const user = await FluentAPI.getUserByEmail(email);

    if (!user?.id) {
      throw new Error('Invalid user response');
    }

    await insertUser(user);

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
      log.info('Chapter assignments synced', { count: allAssignments.length });
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
      return;
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

    log.info('Bible texts sync completed', { count: totalTextsInserted });
  } catch (error) {
    log.error('Bible texts sync failed', { error });
  }
}

export async function syncAllData(email: string) {
  log.info('Starting full sync...');

  const user = await syncUser(email);

  await syncMasterData();

  await syncProjects(user.id, email);

  await syncChapterAssignments(user.id, email);

  try {
    await syncBibleTexts(email);
  } catch (e) {
    log.warn('Bible text sync failed, continuing...', { error: e });
  }

  log.info('Full sync completed successfully!');
}
