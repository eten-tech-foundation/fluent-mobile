const mockExecute = jest.fn();

jest.mock('./db', () => ({
  getDatabase: () => ({
    execute: mockExecute,
  }),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

import {
  getPrepareOfflineChapters,
  getPrepareOfflineProjectContext,
  getProjectNamesByIds,
} from './queries.prepareOffline';

describe('queries.prepareOffline', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  describe('getPrepareOfflineChapters', () => {
    it('maps chapter assignment rows for the project', async () => {
      mockExecute.mockResolvedValue({
        rows: [
          {
            id: 10,
            book_id: 4,
            book_code: 'MRK',
            book_name: 'Mark',
            chapter_number: 2,
            assigned_user_id: 7,
          },
        ],
      });

      await expect(getPrepareOfflineChapters(5)).resolves.toEqual([
        {
          id: 10,
          bookId: 4,
          bookCode: 'MRK',
          bookName: 'Mark',
          chapterNumber: 2,
          assignedUserId: 7,
        },
      ]);
      expect(mockExecute.mock.calls[0]?.[1]).toEqual([5]);
    });

    it('returns an empty array when no chapters are assigned', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      await expect(getPrepareOfflineChapters(5)).resolves.toEqual([]);
    });

    it('rethrows when the query fails', async () => {
      mockExecute.mockRejectedValue(new Error('db unavailable'));

      await expect(getPrepareOfflineChapters(5)).rejects.toThrow(
        'db unavailable',
      );
    });
  });

  describe('getPrepareOfflineProjectContext', () => {
    it('returns project id and trimmed source language code', async () => {
      mockExecute.mockResolvedValue({
        rows: [{ project_id: 5, source_language_code: ' eng ' }],
      });

      await expect(getPrepareOfflineProjectContext(5)).resolves.toEqual({
        projectId: 5,
        sourceLanguageCode: 'eng',
      });
    });

    it('returns null when the project or language code is missing', async () => {
      mockExecute.mockResolvedValue({
        rows: [{ project_id: 5, source_language_code: '   ' }],
      });

      await expect(getPrepareOfflineProjectContext(5)).resolves.toBeNull();
    });

    it('returns null when no project row is found', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      await expect(getPrepareOfflineProjectContext(5)).resolves.toBeNull();
    });

    it('rethrows when the query fails', async () => {
      mockExecute.mockRejectedValue(new Error('db unavailable'));

      await expect(getPrepareOfflineProjectContext(5)).rejects.toThrow(
        'db unavailable',
      );
    });
  });

  describe('getProjectNamesByIds', () => {
    it('returns an empty map without querying when no ids are provided', async () => {
      await expect(getProjectNamesByIds([])).resolves.toEqual(new Map());
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('returns project names for unique ids', async () => {
      mockExecute.mockResolvedValue({
        rows: [
          { id: 2, name: 'Mark' },
          { id: 3, name: 'Luke' },
        ],
      });

      await expect(getProjectNamesByIds([2, 3, 2])).resolves.toEqual(
        new Map([
          [2, 'Mark'],
          [3, 'Luke'],
        ]),
      );
      expect(mockExecute.mock.calls[0]?.[1]).toEqual([2, 3]);
    });

    it('rethrows when the query fails', async () => {
      mockExecute.mockRejectedValue(new Error('db unavailable'));

      await expect(getProjectNamesByIds([1])).rejects.toThrow('db unavailable');
    });
  });
});
