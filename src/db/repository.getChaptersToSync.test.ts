import { setDatabase } from './db';
import { getChaptersToSync } from './repository';

type ChapterAssignmentSeed = {
  bible_id: number;
  book_id: number;
  chapter_number: number;
  project_unit_id: number;
  assigned_user_id: number | null;
};

type ProjectUnitSeed = {
  id: number;
  project_id: number;
};

type UserProjectSeed = {
  user_id: number;
  project_id: number;
};

function createGetChaptersToSyncDb(seed: {
  assignments: ChapterAssignmentSeed[];
  projectUnits: ProjectUnitSeed[];
  userProjects: UserProjectSeed[];
}) {
  const execute = async (query: string, params: unknown[] = []) => {
    const sql = query.replace(/\s+/g, ' ').trim();

    if (
      sql.includes('FROM chapter_assignments ca') &&
      sql.includes('INNER JOIN project_units pu') &&
      sql.includes('INNER JOIN user_projects up') &&
      sql.includes('WHERE up.user_id IN')
    ) {
      const eligible = new Set(params as number[]);
      const projectIdsForUsers = new Set(
        seed.userProjects
          .filter(up => eligible.has(up.user_id))
          .map(up => up.project_id),
      );
      const unitIdsForProjects = new Set(
        seed.projectUnits
          .filter(pu => projectIdsForUsers.has(pu.project_id))
          .map(pu => pu.id),
      );

      const seen = new Set<string>();
      const rows: Array<{
        bible_id: number;
        book_id: number;
        chapter_number: number;
      }> = [];

      for (const ca of seed.assignments) {
        if (!unitIdsForProjects.has(ca.project_unit_id)) continue;
        const key = `${ca.bible_id}:${ca.book_id}:${ca.chapter_number}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          bible_id: ca.bible_id,
          book_id: ca.book_id,
          chapter_number: ca.chapter_number,
        });
      }

      rows.sort(
        (a, b) =>
          a.bible_id - b.bible_id ||
          a.book_id - b.book_id ||
          a.chapter_number - b.chapter_number,
      );
      return { rows };
    }

    throw new Error(`Unexpected SQL in getChaptersToSync test: ${sql}`);
  };

  return {
    execute,
    transaction: async (
      fn: (tx: { execute: typeof execute }) => Promise<void>,
    ) => {
      await fn({ execute });
    },
  };
}

function chapterList(
  groups: Map<number, { bookId: number; chapterNumber: number }[]>,
) {
  return [...groups.entries()].flatMap(([bibleId, chapters]) =>
    chapters.map(c => ({
      bibleId,
      bookId: c.bookId,
      chapterNumber: c.chapterNumber,
    })),
  );
}

describe('getChaptersToSync', () => {
  const baseSeed = {
    projectUnits: [
      { id: 100, project_id: 10 }, // known user A's project
      { id: 200, project_id: 20 }, // known user B's project
      { id: 300, project_id: 30 }, // stale / removed account project
    ],
    userProjects: [
      { user_id: 1, project_id: 10 },
      { user_id: 2, project_id: 20 },
      // user 99 removed from device — membership intentionally absent
    ],
    assignments: [
      // User 1's project catalogue: assigned to someone else on the project
      {
        bible_id: 10,
        book_id: 41,
        chapter_number: 1,
        project_unit_id: 100,
        assigned_user_id: 77,
      },
      // User 1's project: unassigned catalogue row
      {
        bible_id: 10,
        book_id: 19,
        chapter_number: 1,
        project_unit_id: 100,
        assigned_user_id: null,
      },
      // User 2's project catalogue
      {
        bible_id: 10,
        book_id: 40,
        chapter_number: 5,
        project_unit_id: 200,
        assigned_user_id: 2,
      },
      // Stale assignment: no known-user membership on project 30
      {
        bible_id: 10,
        book_id: 1,
        chapter_number: 1,
        project_unit_id: 300,
        assigned_user_id: 99,
      },
    ],
  };

  beforeEach(() => {
    setDatabase(createGetChaptersToSyncDb(baseSeed) as never);
  });

  it('includes project-catalogue chapters for known users even when assigned to someone else', async () => {
    const groups = await getChaptersToSync([1]);

    expect(chapterList(groups)).toEqual([
      { bibleId: 10, bookId: 19, chapterNumber: 1 },
      { bibleId: 10, bookId: 41, chapterNumber: 1 },
    ]);
  });

  it('excludes stale assignment rows with no known-user user_projects membership', async () => {
    const groups = await getChaptersToSync([1, 2]);

    expect(chapterList(groups)).toEqual([
      { bibleId: 10, bookId: 19, chapterNumber: 1 },
      { bibleId: 10, bookId: 40, chapterNumber: 5 },
      { bibleId: 10, bookId: 41, chapterNumber: 1 },
    ]);
    expect(chapterList(groups)).not.toContainEqual({
      bibleId: 10,
      bookId: 1,
      chapterNumber: 1,
    });
  });

  it('scopes single-user syncAllData path to the syncing user only', async () => {
    // Account switch / login for user 1 must not pull user 2's catalogue.
    const groups = await getChaptersToSync([1]);

    expect(chapterList(groups)).toEqual([
      { bibleId: 10, bookId: 19, chapterNumber: 1 },
      { bibleId: 10, bookId: 41, chapterNumber: 1 },
    ]);
    expect(chapterList(groups)).not.toContainEqual({
      bibleId: 10,
      bookId: 40,
      chapterNumber: 5,
    });
  });

  it('preserves the union of known users catalogues for syncAllUsers', async () => {
    const groups = await getChaptersToSync([1, 2]);

    expect(chapterList(groups)).toEqual(
      expect.arrayContaining([
        { bibleId: 10, bookId: 19, chapterNumber: 1 },
        { bibleId: 10, bookId: 41, chapterNumber: 1 },
        { bibleId: 10, bookId: 40, chapterNumber: 5 },
      ]),
    );
    expect(chapterList(groups)).toHaveLength(3);
  });

  it('returns an empty Map when eligible user ids are empty', async () => {
    // Catch-all empty Map on DB errors would also pass if an unscoped SELECT
    // ran and the fake threw. Assert execute is never called for [].
    const execute = jest.fn(async () => ({
      rows: [{ bible_id: 10, book_id: 1, chapter_number: 1 }],
    }));
    setDatabase({ execute, transaction: jest.fn() } as never);

    const groups = await getChaptersToSync([]);

    expect(execute).not.toHaveBeenCalled();
    expect(groups.size).toBe(0);
  });
});
