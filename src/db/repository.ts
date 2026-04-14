import { getDatabase } from './db';

export async function insertUser(user: any) {
  const db = getDatabase();

  try {
    await db.execute(
      `INSERT OR REPLACE INTO users 
      (id, username, email, first_name, last_name)
      VALUES (?, ?, ?, ?, ?)`,
      [
        user.id,
        user.username,
        user.email,
        user.firstName ?? null,
        user.lastName ?? null,
      ],
    );
  } catch (error) {
    console.error('Error inserting user:', error);
  }
}

export async function insertLanguages(data: any[]) {
  const db = getDatabase();

  await db.transaction(async (tx: any) => {
    for (const lang of data) {
      await tx.execute(
        `INSERT OR REPLACE INTO languages 
        (id, lang_name, lang_name_localized, lang_code_iso_639_3, script_direction)
        VALUES (?, ?, ?, ?, ?)`,
        [
          lang.id,
          lang.langName,
          lang.langNameLocalized ?? null,
          lang.langCode,
          lang.scriptDirection ?? 'ltr',
        ],
      );
    }
  });
}

export async function insertBooks(data: any[]) {
  const db = getDatabase();

  await db.transaction(async (tx: any) => {
    for (const book of data) {
      const name = book.eng_display_name;

      if (!name) {
        console.warn('Skipping invalid book:', book);
        continue;
      }

      await tx.execute(
        `INSERT OR REPLACE INTO books 
        (id, code, eng_display_name)
        VALUES (?, ?, ?)`,
        [book.id, book.code, name],
      );
    }
  });
}

export async function insertBibles(data: any[]) {
  const db = getDatabase();

  await db.transaction(async (tx: any) => {
    for (const bible of data) {
      const name = bible.name;
      const abbr = bible.abbreviation;

      if (!name || !abbr) {
        console.warn('Skipping invalid bible:', bible);
        continue;
      }

      await tx.execute(
        `INSERT OR REPLACE INTO bibles 
        (id, language_id, name, abbreviation)
        VALUES (?, ?, ?, ?)`,
        [bible.id, bible.languageId, name, abbr],
      );
    }
  });
}

export async function insertProjects(data: any[]) {
  const db = getDatabase();

  await db.transaction(async (tx: any) => {
    for (const project of data) {
      if (!project?.id || !project?.name) {
        console.warn('Skipping invalid project:', project);
        continue;
      }

      const sourceLangId =
        project.sourceLanguageId ?? project.source_language_id;
      const targetLangId =
        project.targetLanguageId ?? project.target_language_id;

      if (!sourceLangId || !targetLangId) {
        console.warn('Skipping project with missing language IDs:', project);
        continue;
      }

      await tx.execute(
        `INSERT OR REPLACE INTO projects 
        (id, name, source_language_id, target_language_id, is_active, status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          project.id,
          project.name,
          sourceLangId,
          targetLangId,
          project.isActive ? 1 : 0,
          project.status ?? 'not_assigned',
          project.updatedAt ?? new Date().toISOString(),
        ],
      );
    }
  });
}

export async function insertChapterAssignments(data: any[]) {
  const db = getDatabase();

  await db.transaction(async (tx: any) => {
    for (const assignment of data) {
      if (!assignment?.chapterAssignmentId) {
        console.warn('Skipping invalid chapter assignment:', assignment);
        continue;
      }

      await tx.execute(
        `INSERT OR REPLACE INTO chapter_assignments 
        (id, project_unit_id, bible_id, book_id, chapter_number, 
         assigned_user_id, status, submitted_time, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          assignment.chapterAssignmentId,
          assignment.projectUnitId,
          assignment.bibleId,
          assignment.bookId,
          assignment.chapterNumber,
          assignment.assignedUserId ?? null,
          assignment.chapterStatus ?? 'not_started',
          assignment.submittedTime ?? null,
          assignment.updatedAt ?? new Date().toISOString(),
        ],
      );
    }
  });
}

export async function insertProjectUnits(assignments: any[]) {
  const db = getDatabase();

  const unitsMap = new Map<number, { id: number; projectId: number }>();

  for (const assignment of assignments) {
    const projectUnitId = assignment.projectUnitId;
    const projectId = assignment.projectId;

    if (!projectUnitId || !projectId) {
      console.warn(
        'Skipping assignment without projectUnitId or projectId:',
        assignment,
      );
      continue;
    }

    if (unitsMap.has(projectUnitId)) continue;

    unitsMap.set(projectUnitId, { id: projectUnitId, projectId });
  }

  if (unitsMap.size > 0) {
    await db.transaction(async (tx: any) => {
      for (const unit of unitsMap.values()) {
        await tx.execute(
          `INSERT OR REPLACE INTO project_units 
          (id, project_id, status)
          VALUES (?, ?, ?)`,
          [unit.id, unit.projectId, 'not_started'],
        );
      }
    });

    console.log(`Project units inserted: ${unitsMap.size}`);
  }
}

export async function getChaptersToSync() {
  const db = getDatabase();
  try {
    const result = await db.execute(`
      SELECT DISTINCT bible_id, book_id, chapter_number
      FROM chapter_assignments
      ORDER BY bible_id, book_id, chapter_number
    `);

    const bibleGroups = new Map<
      number,
      Array<{ bookId: number; chapterNumber: number }>
    >();

    for (const row of result?.rows || []) {
      const bibleId = row.bible_id;
      const bookId = row.book_id;
      const chapterNumber = row.chapter_number;

      if (!bibleGroups.has(bibleId)) {
        bibleGroups.set(bibleId, []);
      }

      bibleGroups.get(bibleId)!.push({
        bookId,
        chapterNumber,
      });
    }

    console.log(`Found ${bibleGroups.size} bibles with chapters to sync`);
    return bibleGroups;
  } catch (error) {
    console.error('Error getting chapters to sync:', error);
    return new Map();
  }
}

export async function insertBibleTexts(data: any[]) {
  const db = getDatabase();

  if (!data || data.length === 0) {
    console.log('No bible texts to insert');
    return;
  }

  try {
    await db.transaction(async (tx: any) => {
      for (const book of data) {
        const bookId = book.bookId;
        const chapterNumber = book.chapterNumber;
        const verses = book.verses || [];

        for (const verse of verses) {
          await tx.execute(
            `INSERT OR REPLACE INTO bible_texts 
            (bible_id, book_id, chapter_number, verse_number, text)
            VALUES (?, ?, ?, ?, ?)`,
            [
              verse.bibleId,
              bookId,
              chapterNumber,
              verse.verseNumber,
              verse.text,
            ],
          );
        }
      }
    });

    console.log(`Bible texts inserted: ${data.length} books`);
  } catch (error) {
    console.error('Error inserting bible texts:', error);
    throw error;
  }
}

export async function checkIfTextsSynced(
  bibleId: number,
  bookId: number,
  chapterNumber: number,
): Promise<boolean> {
  const db = getDatabase();
  try {
    const result = await db.execute(
      `SELECT COUNT(*) as count FROM bible_texts 
       WHERE bible_id = ? AND book_id = ? AND chapter_number = ?`,
      [bibleId, bookId, chapterNumber],
    );

    return (result?.rows?.[0]?.count || 0) > 0;
  } catch (error) {
    console.error('Error checking if texts synced:', error);
    return false;
  }
}
