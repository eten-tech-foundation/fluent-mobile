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

jest.mock('../utils/parseUserId', () => ({
  parseUserId: jest.fn(() => 42),
}));

import { getFailedUploadErrorSummary } from './queries';

describe('getFailedUploadErrorSummary', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('returns the most recent upload_error for selected failed takes', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        { upload_error: 'Audio storage is unavailable' },
        { upload_error: 'Audio storage is unavailable' },
      ],
    });

    await expect(getFailedUploadErrorSummary()).resolves.toEqual({
      latestMessage: 'Audio storage is unavailable',
      extraDistinctCount: 0,
    });
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("sync_status = 'failed'"),
      [42],
    );
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY updated_at DESC'),
      [42],
    );
  });

  it('appends (+N more) when distinct messages exist after the latest', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        {
          upload_error:
            'Missing projectUnitId for recording (no matching chapter assignment)',
        },
        { upload_error: 'Audio storage is unavailable' },
        { upload_error: 'Audio storage is unavailable' },
      ],
    });

    await expect(getFailedUploadErrorSummary()).resolves.toEqual({
      latestMessage:
        'Missing projectUnitId for recording (no matching chapter assignment)',
      extraDistinctCount: 1,
    });
  });

  it('returns null when there are no failed upload errors', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    await expect(getFailedUploadErrorSummary()).resolves.toBeNull();
  });

  it('returns null when the query throws', async () => {
    mockExecute.mockRejectedValue(new Error('db unavailable'));
    await expect(getFailedUploadErrorSummary()).resolves.toBeNull();
  });
});
