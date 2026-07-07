import { getVerseDetailNavByChapterAssignment } from './queries';

interface MockDb {
  execute: jest.Mock;
}

let mockDb: MockDb;

jest.mock('./db', () => ({
  getDatabase: () => mockDb,
}));

describe('getVerseDetailNavByChapterAssignment', () => {
  it('maps a row into VerseDetail route params', async () => {
    mockDb = {
      execute: jest.fn().mockResolvedValue({
        rows: [
          {
            chapter_id: 88,
            chapter_number: 1,
            book_name: 'Genesis',
            project_name: 'Demo Project',
            target_language_name: 'Swahili',
          },
        ],
      }),
    };

    const result = await getVerseDetailNavByChapterAssignment(88);

    expect(result).toEqual({
      chapterId: 88,
      chapterName: 'Genesis 1',
      projectName: 'Demo Project',
      language: 'Swahili',
    });
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringMatching(/FROM chapter_assignments/),
      [88],
    );
  });

  it('tolerates a missing language and book name', async () => {
    mockDb = {
      execute: jest.fn().mockResolvedValue({
        rows: [
          {
            chapter_id: 88,
            chapter_number: 3,
            book_name: null,
            project_name: null,
            target_language_name: null,
          },
        ],
      }),
    };

    expect(await getVerseDetailNavByChapterAssignment(88)).toEqual({
      chapterId: 88,
      chapterName: '3',
      projectName: '',
      language: '',
    });
  });

  it('returns null when no row matches', async () => {
    mockDb = { execute: jest.fn().mockResolvedValue({ rows: [] }) };
    expect(await getVerseDetailNavByChapterAssignment(88)).toBeNull();
  });

  it('returns null when the query throws', async () => {
    mockDb = { execute: jest.fn().mockRejectedValue(new Error('boom')) };
    expect(await getVerseDetailNavByChapterAssignment(88)).toBeNull();
  });
});
