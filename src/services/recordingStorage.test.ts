import {
  buildRecordingKey,
  deleteRecordingFile,
  extensionFromUri,
  moveIntoStore,
  recordingKeySegments,
  resolveRecordingUri,
} from './recordingStorage';

const mockDocument = { uri: 'file:///docs' };
const mockMove = jest.fn().mockResolvedValue(undefined);
const mockCreate = jest.fn();
const mockDelete = jest.fn();
let mockFileExists = true;
let mockFileSize = 4096;

jest.mock('expo-file-system', () => ({
  Paths: {
    get document() {
      return mockDocument;
    },
  },
  File: jest
    .fn()
    .mockImplementation((...uris: Array<{ uri: string } | string>) => ({
      uri: uris.map(u => (typeof u === 'string' ? u : u.uri)).join('/'),
      move: mockMove,
      delete: mockDelete,
      get exists() {
        return mockFileExists;
      },
      get size() {
        return mockFileSize;
      },
    })),
  Directory: jest
    .fn()
    .mockImplementation((...uris: Array<{ uri: string } | string>) => ({
      uri: uris.map(u => (typeof u === 'string' ? u : u.uri)).join('/'),
      create: mockCreate,
      delete: mockDelete,
      get exists() {
        return true;
      },
    })),
}));

const baseParts = {
  userId: '123',
  projectId: 45,
  bookCode: 'gen',
  chapterNumber: 1,
  verseNumber: 7,
  recordingId: 'rec-1',
};

describe('extensionFromUri', () => {
  it('extracts a lowercase extension', () => {
    expect(extensionFromUri('file:///tmp/take.M4A')).toBe('m4a');
    expect(extensionFromUri('file:///tmp/take.wav')).toBe('wav');
  });

  it('ignores query strings and fragments', () => {
    expect(extensionFromUri('file:///tmp/take.m4a?x=1')).toBe('m4a');
  });

  it('falls back to m4a when there is no extension', () => {
    expect(extensionFromUri('file:///tmp/take')).toBe('m4a');
  });
});

describe('buildRecordingKey', () => {
  it('builds a per-user/project/verse key with a UUID filename', () => {
    expect(buildRecordingKey(baseParts)).toBe(
      'recordings/u123/p45/GEN/c001/v007/rec-1.m4a',
    );
  });

  it('pads chapter and verse and uppercases the book code', () => {
    expect(
      recordingKeySegments({ ...baseParts, chapterNumber: 12, verseNumber: 3 }),
    ).toEqual([
      'recordings',
      'u123',
      'p45',
      'GEN',
      'c012',
      'v003',
      'rec-1.m4a',
    ]);
  });

  it('honors a provided extension', () => {
    expect(buildRecordingKey({ ...baseParts, extension: 'wav' })).toBe(
      'recordings/u123/p45/GEN/c001/v007/rec-1.wav',
    );
  });

  it('sanitizes unsafe characters in segments', () => {
    expect(
      buildRecordingKey({ ...baseParts, userId: 'a/b c', bookCode: 'x!y' }),
    ).toBe('recordings/ua_b_c/p45/X_Y/c001/v007/rec-1.m4a');
  });

  it('replaces reserved path segments (. and ..) with safe fallbacks', () => {
    expect(buildRecordingKey({ ...baseParts, bookCode: '..' })).toBe(
      'recordings/u123/p45/UNK/c001/v007/rec-1.m4a',
    );
    expect(buildRecordingKey({ ...baseParts, bookCode: '.' })).toBe(
      'recordings/u123/p45/UNK/c001/v007/rec-1.m4a',
    );
    expect(buildRecordingKey({ ...baseParts, userId: '..' })).toBe(
      'recordings/uunknown/p45/GEN/c001/v007/rec-1.m4a',
    );
    expect(buildRecordingKey({ ...baseParts, recordingId: '..' })).toBe(
      'recordings/u123/p45/GEN/c001/v007/unknown.m4a',
    );
  });
});

describe('resolveRecordingUri', () => {
  it('joins relative keys against the document directory', () => {
    expect(
      resolveRecordingUri('recordings/u1/p2/GEN/c001/v001/a.m4a'),
    ).toContain('recordings/u1/p2/GEN/c001/v001/a.m4a');
    expect(resolveRecordingUri('recordings/u1/a.m4a')).toContain(
      'file:///docs',
    );
  });

  it('returns already-absolute paths unchanged (legacy rows)', () => {
    expect(resolveRecordingUri('file:///tmp/legacy.m4a')).toBe(
      'file:///tmp/legacy.m4a',
    );
    expect(resolveRecordingUri('/tmp/legacy.m4a')).toBe('/tmp/legacy.m4a');
  });

  it('rejects relative keys containing reserved path segments', () => {
    expect(() => resolveRecordingUri('recordings/u1/../secret.m4a')).toThrow(
      'Invalid recording path segment',
    );
  });
});

describe('moveIntoStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFileSize = 4096;
  });

  it('creates intermediate directories and moves the file, returning size', async () => {
    const result = await moveIntoStore({
      sourceUri: 'file:///cache/take.m4a',
      key: 'recordings/u1/p2/GEN/c001/v001/rec-1.m4a',
    });

    expect(mockCreate).toHaveBeenCalledWith({
      intermediates: true,
      idempotent: true,
    });
    expect(mockMove).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      key: 'recordings/u1/p2/GEN/c001/v001/rec-1.m4a',
      sizeBytes: 4096,
    });
  });

  it('rejects keys containing reserved path segments', async () => {
    await expect(
      moveIntoStore({
        sourceUri: 'file:///cache/take.m4a',
        key: 'recordings/u1/p2/../v001/rec-1.m4a',
      }),
    ).rejects.toThrow('Invalid recording path segment');
  });
});

describe('deleteRecordingFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFileExists = true;
  });

  it('deletes an existing file', () => {
    deleteRecordingFile('recordings/u1/p2/GEN/c001/v001/rec-1.m4a');
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the file is missing', () => {
    mockFileExists = false;
    deleteRecordingFile('recordings/u1/p2/GEN/c001/v001/missing.m4a');
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
