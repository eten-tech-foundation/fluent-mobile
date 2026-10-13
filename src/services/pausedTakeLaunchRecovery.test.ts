import { collectLaunchRecoveries } from './pausedTakeLaunchRecovery';
import {
  listPausedTakes,
  upsertPausedTake,
  type PausedTakeMarker,
} from './pausedTakes';

const mockStore = new Map<string, string>();
const mockExisting = new Set<string>();
const mockDeleteFile = jest.fn();

jest.mock('./storage', () => ({
  kvStorage: {
    getItemSync: (key: string) => mockStore.get(key) ?? null,
    setItemSync: (key: string, value: string) => {
      mockStore.set(key, value);
    },
  },
}));

jest.mock('../utils/audioStorage', () => ({
  fileExists: (uri: string) => Promise.resolve(mockExisting.has(uri)),
  deleteFile: (uri: string) => mockDeleteFile(uri),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

const marker = (
  overrides: Partial<PausedTakeMarker> = {},
): PausedTakeMarker => ({
  sessionKey: '7:3',
  segments: ['file:///a.aac'],
  elapsedMs: 10_000,
  startedAt: '2026-10-05T10:00:00.000Z',
  chapterAssignmentId: 7,
  verseNumber: 3,
  ...overrides,
});

beforeEach(() => {
  mockStore.clear();
  mockExisting.clear();
  mockDeleteFile.mockReset();
  mockDeleteFile.mockResolvedValue(undefined);
});

describe('collectLaunchRecoveries', () => {
  it('returns a good marker and leaves it stored', async () => {
    mockExisting.add('file:///a.aac');
    upsertPausedTake(marker());

    const result = await collectLaunchRecoveries();

    expect(result).toEqual([marker()]);
    expect(listPausedTakes()).toEqual([marker()]);
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it('clears an orphaned marker and deletes its files', async () => {
    mockExisting.add('file:///a.aac');
    upsertPausedTake(marker({ verseNumber: undefined }));

    const result = await collectLaunchRecoveries();

    expect(result).toEqual([]);
    expect(listPausedTakes()).toEqual([]);
    expect(mockDeleteFile).toHaveBeenCalledWith('file:///a.aac');
  });

  it('clears a marker with no surviving segment files', async () => {
    upsertPausedTake(marker());

    const result = await collectLaunchRecoveries();

    expect(result).toEqual([]);
    expect(listPausedTakes()).toEqual([]);
  });

  it('returns only surviving segments for a partly missing marker', async () => {
    mockExisting.add('file:///a.aac');
    upsertPausedTake(marker({ segments: ['file:///a.aac', 'file:///b.aac'] }));

    const result = await collectLaunchRecoveries();

    expect(result).toEqual([marker({ segments: ['file:///a.aac'] })]);
  });

  it('handles several markers, keeping good ones and cleaning bad ones', async () => {
    mockExisting.add('file:///a.aac');
    mockExisting.add('file:///c.aac');
    upsertPausedTake(marker({ sessionKey: '7:3' }));
    upsertPausedTake(
      marker({
        sessionKey: '7:4',
        verseNumber: undefined,
        segments: ['file:///b.aac'],
      }),
    );
    upsertPausedTake(
      marker({
        sessionKey: '7:5',
        verseNumber: 5,
        segments: ['file:///c.aac'],
      }),
    );

    const result = await collectLaunchRecoveries();

    expect(result.map(m => m.sessionKey)).toEqual(['7:3', '7:5']);
    expect(listPausedTakes().map(m => m.sessionKey)).toEqual(['7:3', '7:5']);
    expect(mockDeleteFile).toHaveBeenCalledWith('file:///b.aac');
  });

  it('still clears the marker when deleting a file fails', async () => {
    mockDeleteFile.mockRejectedValue(new Error('disk'));
    upsertPausedTake(marker({ verseNumber: undefined }));

    await expect(collectLaunchRecoveries()).resolves.toEqual([]);
    expect(listPausedTakes()).toEqual([]);
  });
});
