import { waitFor } from '@testing-library/react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { addRecordingTake } from '../db/repository';
import { resetFileSystemMock } from '../test/mocks/expo-file-system';
import { defaultPersistTake, type PersistTakeArgs } from './useVerseAudio';

jest.mock('../db/repository', () => ({ addRecordingTake: jest.fn() }));
jest.mock('./useRecordingEngine', () => ({ useRecordingEngine: jest.fn() }));
jest.mock('./usePlaybackEngine', () => ({ usePlaybackEngine: jest.fn() }));
jest.mock('../audio/aacRemux', () => ({ getRemuxNativeModule: () => null }));
jest.mock('../services/uploadOrchestrator', () => ({
  notifyPendingUploads: jest.fn(),
}));
jest.mock('../services/chapterClaimSync', () => ({
  syncChapterClaim: jest.fn(),
}));
jest.mock('../services/connectivity', () => ({
  getConnectivitySnapshot: jest.fn(),
}));
jest.mock('../services/pausedTakes', () => ({
  clearPausedTake: jest.fn(),
  listPausedTakes: jest.fn(),
  upsertPausedTake: jest.fn(),
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

// Exercises real persistence orchestration and audioStorage against the shared
// in-memory Expo filesystem. Repository completion is mocked, not SQLite commit.
describe('defaultPersistTake file-to-repository handoff', () => {
  const source = 'file:///mock-document/capture.aac';
  const bytes = 'synthetic-adts-payload';
  const args: PersistTakeArgs = {
    bibleTextId: 40,
    viewBibleTextId: 42,
    projectUnitId: 9,
    granularity: 'pericope',
    startChapter: 1,
    startVerse: 2,
    endChapter: 1,
    endVerse: 4,
    tempUri: source,
    tempUris: [source],
    durationMs: 1500,
  };

  beforeEach(async () => {
    resetFileSystemMock();
    jest.mocked(addRecordingTake).mockReset();
    jest.mocked(addRecordingTake).mockResolvedValue('inserted');
    await FileSystem.writeAsStringAsync(source, bytes);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('copies the complete take before insert and removes capture only after repository completion', async () => {
    let finishInsert!: (id: string) => void;
    jest.mocked(addRecordingTake).mockImplementationOnce(
      () =>
        new Promise<string>(resolve => {
          finishInsert = resolve;
        }),
    );
    const deletion = jest.spyOn(FileSystem, 'deleteAsync');

    const save = defaultPersistTake(args);
    await waitFor(() => expect(addRecordingTake).toHaveBeenCalledTimes(1));
    const input = jest.mocked(addRecordingTake).mock.calls[0]![0];
    expect(input).toEqual({
      id: expect.stringMatching(/^rec_/),
      bibleTextId: 40,
      viewBibleTextId: 42,
      projectUnitId: 9,
      localFilePath: expect.stringMatching(
        /^file:\/\/\/mock-document\/recordings\/rec_.*\.aac$/,
      ),
      durationMs: 1500,
      fileSizeBytes: bytes.length,
      granularity: 'pericope',
      startChapter: 1,
      startVerse: 2,
      endChapter: 1,
      endVerse: 4,
    });
    expect(input.localFilePath).not.toBe(source);
    await expect(
      FileSystem.readAsStringAsync(input.localFilePath),
    ).resolves.toBe(bytes);
    await expect(FileSystem.readAsStringAsync(source)).resolves.toBe(bytes);
    expect(deletion).not.toHaveBeenCalled();

    finishInsert(input.id!);
    await expect(save).resolves.toEqual({
      id: input.id,
      localFilePath: input.localFilePath,
    });
    expect(await FileSystem.getInfoAsync(source)).toMatchObject({
      exists: false,
    });
    await expect(
      FileSystem.readAsStringAsync(input.localFilePath),
    ).resolves.toBe(bytes);
    expect(deletion).not.toHaveBeenCalledWith(
      input.localFilePath,
      expect.anything(),
    );
  });

  it('propagates insert rejection without deleting the original capture', async () => {
    const failure = new Error('repository insert failed');
    jest.mocked(addRecordingTake).mockRejectedValueOnce(failure);
    const deletion = jest.spyOn(FileSystem, 'deleteAsync');

    await expect(defaultPersistTake(args)).rejects.toBe(failure);

    expect(addRecordingTake).toHaveBeenCalledTimes(1);
    const input = jest.mocked(addRecordingTake).mock.calls[0]![0];
    await expect(FileSystem.readAsStringAsync(source)).resolves.toBe(bytes);
    await expect(
      FileSystem.readAsStringAsync(input.localFilePath),
    ).resolves.toBe(bytes);
    expect(deletion).not.toHaveBeenCalled();
  });

  it('does not insert or delete capture when the final copy fails', async () => {
    const failure = new Error('copy failed');
    jest.spyOn(FileSystem, 'copyAsync').mockRejectedValueOnce(failure);
    const deletion = jest.spyOn(FileSystem, 'deleteAsync');

    await expect(defaultPersistTake(args)).rejects.toBe(failure);

    expect(addRecordingTake).not.toHaveBeenCalled();
    expect(deletion).not.toHaveBeenCalled();
    await expect(FileSystem.readAsStringAsync(source)).resolves.toBe(bytes);
  });
});
