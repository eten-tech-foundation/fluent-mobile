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

export async function syncUser(email: string) {
  try {
    console.log('Syncing user...');

    const user = await FluentAPI.getUserByEmail(email);

    if (!user?.id) {
      throw new Error('Invalid user response');
    }

    await insertUser(user);

    console.log('User synced:', user.email);

    return user;
  } catch (error) {
    console.error('User sync failed:', error);
    throw error;
  }
}

export async function syncMasterData() {
  try {
    console.log('Sync started');

    const [languages, books, bibles] = await Promise.all([
      FluentAPI.getLanguages(),
      FluentAPI.getBooks(),
      FluentAPI.getBibles(),
    ]);

    await insertLanguages(languages);
    await insertBooks(books);
    await insertBibles(bibles);

    console.log('Sync completed');
  } catch (error) {
    console.error('Sync failed:', error);
  }
}

export async function syncProjects(userId: number, email: string) {
  try {
    console.log('Syncing projects...');

    const projects = await FluentAPI.getUserProjects(userId, email);

    await insertProjects(projects);

    console.log(`Projects synced: ${projects.length}`);
  } catch (error) {
    console.error('Project sync failed:', error);
  }
}

export async function syncChapterAssignments(userId: number, email: string) {
  try {
    console.log('Syncing chapter assignments...');

    const response = await FluentAPI.getChapterAssignments(userId, email);

    const allAssignments = [
      ...(response?.assignedChapters || []),
      ...(response?.peerCheckChapters || []),
    ];

    if (allAssignments.length > 0) {
      await insertProjectUnits(allAssignments);

      await insertChapterAssignments(allAssignments);
      console.log(`Chapter assignments synced: ${allAssignments.length}`);
    }
  } catch (error) {
    console.error('Chapter assignment sync failed:', error);
  }
}

export async function syncBibleTexts(email: string) {
  try {
    console.log('Syncing bible texts...');

    const bibleGroups = await getChaptersToSync();

    if (bibleGroups.size === 0) {
      console.log('No chapters to sync');
      return;
    }

    let totalTextsInserted = 0;

    for (const [bibleId, chapters] of bibleGroups) {
      try {
        console.log(
          `Syncing ${chapters.length} chapters for bible ${bibleId}...`,
        );

        const response = await FluentAPI.getBibleTexts(
          bibleId,
          chapters,
          email,
        );

        if (response && Array.isArray(response)) {
          const textsWithBibleId = response.map((book: any) => ({
            ...book,
            verses: (book.verses || []).map((verse: any) => ({
              ...verse,
              bibleId,
            })),
          }));

          await insertBibleTexts(textsWithBibleId);
          totalTextsInserted += response.length;

          console.log(`Synced ${response.length} books for bible ${bibleId}`);
        }
      } catch (error) {
        console.error(`Failed to sync texts for bible ${bibleId}:`, error);
        continue;
      }
    }

    console.log(`Bible texts sync completed: ${totalTextsInserted} books`);
  } catch (error) {
    console.error('Bible texts sync failed:', error);
  }
}

export async function syncAllData(email: string) {
  console.log('Starting full sync...');

  const user = await syncUser(email);

  await syncMasterData();

  await syncProjects(user.id, email);

  await syncChapterAssignments(user.id, email);

  try {
    await syncBibleTexts(email);
  } catch (e) {
    console.warn('Bible text sync failed, continuing...', e);
  }

  console.log('Full sync completed successfully!');
}
