import {
  aacDurationMs,
  aacDurationMsFromBytes,
  buildRecordingKey,
  concatenateAacSegments,
  deleteRecordingFile,
  extensionFromUri,
  moveIntoStore,
  mp4DurationMs,
  mp4DurationMsFromBytes,
  recordingKeySegments,
  remuxTakeToSeekableContainer,
  resolveRecordingUri,
} from './recordingStorage';

const mockIsAacRemuxAvailable = jest.fn();
const mockRemuxAacToMp4 = jest.fn();

jest.mock('./aacRemux', () => ({
  isAacRemuxAvailable: () => mockIsAacRemuxAvailable(),
  remuxAacToMp4: (sourceUri: string, destUri: string) =>
    mockRemuxAacToMp4(sourceUri, destUri),
}));

const mockDocument = { uri: 'file:///docs' };
const mockMove = jest.fn().mockResolvedValue(undefined);
const mockCreate = jest.fn();
const mockDelete = jest.fn();
const mockCreateFile = jest.fn();
const mockWrite = jest.fn();
const mockBytes = jest.fn(async () => new Uint8Array([1, 2, 3]));
let mockFileExists = true;
let mockFileSize = 4096;

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'merge-uuid'),
}));

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
      create: mockCreateFile,
      write: mockWrite,
      bytes: mockBytes,
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

describe('concatenateAacSegments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws when given no segments', async () => {
    await expect(concatenateAacSegments([])).rejects.toThrow(
      'at least one segment',
    );
  });

  it('returns a single segment unchanged without touching the filesystem', async () => {
    const result = await concatenateAacSegments(['file:///docs/only.aac']);

    expect(result).toBe('file:///docs/only.aac');
    expect(mockCreateFile).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('byte-appends multiple segments into a fresh merged file', async () => {
    const result = await concatenateAacSegments([
      'file:///docs/a.aac',
      'file:///docs/b.aac',
    ]);

    expect(mockCreateFile).toHaveBeenCalledWith({
      intermediates: true,
      overwrite: true,
    });
    expect(mockBytes).toHaveBeenCalledTimes(2);
    expect(mockWrite).toHaveBeenCalledTimes(2);
    expect(mockWrite).toHaveBeenCalledWith(expect.any(Uint8Array), {
      append: true,
    });
    expect(result).toContain('merge-merge-uuid.aac');
  });
});

/**
 * Builds a single ADTS AAC frame of `frameLength` bytes carrying one raw data
 * block (1024 samples). Only the header fields our parser reads are set; the
 * payload is zero-filled.
 */
function adtsFrame(
  frameLength: number,
  sampleRateIndex = 4,
): Uint8Array<ArrayBuffer> {
  const frame = new Uint8Array(frameLength);
  frame[0] = 0xff;
  frame[1] = 0xf1; // syncword tail + protection_absent
  frame[2] = 0x40 | (sampleRateIndex << 2); // AAC-LC profile + sfi
  frame[3] = (frameLength >> 11) & 0x03;
  frame[4] = (frameLength >> 3) & 0xff;
  frame[5] = (frameLength & 0x07) << 5;
  frame[6] = 0x00; // number_of_raw_data_blocks = 0 -> 1 block
  return frame;
}

function adtsStream(
  frameCount: number,
  frameLength = 16,
): Uint8Array<ArrayBuffer> {
  const stream = new Uint8Array(frameCount * frameLength);
  for (let i = 0; i < frameCount; i++) {
    stream.set(adtsFrame(frameLength), i * frameLength);
  }
  return stream;
}

describe('aacDurationMsFromBytes', () => {
  it('sums frame durations for a well-formed stream', () => {
    const frames = 10;
    const expected = Math.round(((frames * 1024) / 44100) * 1000);
    expect(aacDurationMsFromBytes(adtsStream(frames))).toBe(expected);
  });

  it('respects the sample-rate index in the header', () => {
    // Index 8 -> 16000 Hz.
    const frames = 5;
    const stream = new Uint8Array(frames * 16);
    for (let i = 0; i < frames; i++) {
      stream.set(adtsFrame(16, 8), i * 16);
    }
    const expected = Math.round(((frames * 1024) / 16000) * 1000);
    expect(aacDurationMsFromBytes(stream)).toBe(expected);
  });

  it('stops cleanly at a truncated or garbage tail', () => {
    const valid = adtsStream(3);
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
    const combined = new Uint8Array(valid.length + garbage.length);
    combined.set(valid, 0);
    combined.set(garbage, valid.length);

    const expected = Math.round(((3 * 1024) / 44100) * 1000);
    expect(aacDurationMsFromBytes(combined)).toBe(expected);
  });

  it('ignores a trailing frame whose length runs past the buffer', () => {
    // A final header advertising a longer frame than remains must not count.
    const valid = adtsStream(2);
    const truncatedHeader = adtsFrame(64).slice(0, 10);
    const combined = new Uint8Array(valid.length + truncatedHeader.length);
    combined.set(valid, 0);
    combined.set(truncatedHeader, valid.length);

    const expected = Math.round(((2 * 1024) / 44100) * 1000);
    expect(aacDurationMsFromBytes(combined)).toBe(expected);
  });

  it('returns 0 for empty or non-ADTS bytes', () => {
    expect(aacDurationMsFromBytes(new Uint8Array())).toBe(0);
    expect(aacDurationMsFromBytes(new Uint8Array([1, 2, 3, 4, 5, 6, 7]))).toBe(
      0,
    );
  });
});

describe('aacDurationMs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads the file and returns the parsed duration', async () => {
    const frames = 8;
    mockBytes.mockResolvedValueOnce(adtsStream(frames));
    const expected = Math.round(((frames * 1024) / 44100) * 1000);
    await expect(aacDurationMs('file:///docs/take.aac')).resolves.toBe(
      expected,
    );
  });

  it('returns 0 when the file cannot be read', async () => {
    mockBytes.mockRejectedValueOnce(new Error('read failed'));
    await expect(aacDurationMs('file:///docs/missing.aac')).resolves.toBe(0);
  });
});

function u32(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function u64(value: number): Uint8Array {
  return concatBytes(u32(Math.floor(value / 2 ** 32)), u32(value >>> 0));
}

function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Wraps a payload in an MP4 box (`[uint32 size][4-char type][payload]`). */
function mp4Box(type: string, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const header = concatBytes(
    u32(8 + payload.length),
    new Uint8Array([
      type.charCodeAt(0),
      type.charCodeAt(1),
      type.charCodeAt(2),
      type.charCodeAt(3),
    ]),
  );
  return concatBytes(header, payload);
}

/** Version-0 `mvhd` payload up to (and including) the duration field. */
function mvhdV0(timescale: number, duration: number): Uint8Array<ArrayBuffer> {
  return concatBytes(
    new Uint8Array([0, 0, 0, 0]), // version 0 + flags
    u32(0), // creation_time
    u32(0), // modification_time
    u32(timescale),
    u32(duration),
    u32(0x00010000), // rate (padding our parser skips)
  );
}

/** Version-1 `mvhd` payload with 64-bit times and duration. */
function mvhdV1(timescale: number, duration: number): Uint8Array<ArrayBuffer> {
  return concatBytes(
    new Uint8Array([1, 0, 0, 0]), // version 1 + flags
    u64(0), // creation_time
    u64(0), // modification_time
    u32(timescale),
    u64(duration),
  );
}

describe('mp4DurationMsFromBytes', () => {
  it('reads the duration from moov > mvhd (version 0)', () => {
    const file = concatBytes(
      mp4Box('ftyp', new Uint8Array([0, 0, 0, 0])),
      mp4Box('moov', mp4Box('mvhd', mvhdV0(1000, 3500))),
    );
    expect(mp4DurationMsFromBytes(file)).toBe(3500);
  });

  it('reads a version-1 (64-bit) mvhd', () => {
    const file = concatBytes(
      mp4Box('ftyp', new Uint8Array([0, 0, 0, 0])),
      mp4Box('moov', mp4Box('mvhd', mvhdV1(48000, 96000))),
    );
    // 96000 / 48000 * 1000 = 2000ms.
    expect(mp4DurationMsFromBytes(file)).toBe(2000);
  });

  it('finds moov even when it trails mdat (MediaRecorder layout)', () => {
    const file = concatBytes(
      mp4Box('ftyp', new Uint8Array([0, 0, 0, 0])),
      mp4Box('mdat', new Uint8Array(32)),
      mp4Box('moov', mp4Box('mvhd', mvhdV0(44100, 88200))),
    );
    expect(mp4DurationMsFromBytes(file)).toBe(2000);
  });

  it('returns 0 for a moov-less (crash-truncated) file', () => {
    const file = concatBytes(
      mp4Box('ftyp', new Uint8Array([0, 0, 0, 0])),
      mp4Box('mdat', new Uint8Array(64)),
    );
    expect(mp4DurationMsFromBytes(file)).toBe(0);
  });

  it('returns 0 for the unknown-duration sentinel and a zero timescale', () => {
    const sentinel = concatBytes(
      mp4Box('moov', mp4Box('mvhd', mvhdV0(1000, 0xffffffff))),
    );
    expect(mp4DurationMsFromBytes(sentinel)).toBe(0);

    const zeroTimescale = concatBytes(
      mp4Box('moov', mp4Box('mvhd', mvhdV0(0, 1000))),
    );
    expect(mp4DurationMsFromBytes(zeroTimescale)).toBe(0);
  });

  it('returns 0 for empty or non-MP4 bytes', () => {
    expect(mp4DurationMsFromBytes(new Uint8Array())).toBe(0);
    expect(mp4DurationMsFromBytes(new Uint8Array([1, 2, 3, 4, 5, 6, 7]))).toBe(
      0,
    );
  });
});

describe('mp4DurationMs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads the file and returns the parsed duration', async () => {
    const file = concatBytes(
      mp4Box('moov', mp4Box('mvhd', mvhdV0(1000, 4200))),
    );
    mockBytes.mockResolvedValueOnce(file);
    await expect(mp4DurationMs('file:///docs/take.m4a')).resolves.toBe(4200);
  });

  it('returns 0 when the file cannot be read', async () => {
    mockBytes.mockRejectedValueOnce(new Error('read failed'));
    await expect(mp4DurationMs('file:///docs/missing.m4a')).resolves.toBe(0);
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

describe('remuxTakeToSeekableContainer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFileExists = true;
  });

  it('remuxes to a fresh .m4a in the document directory when available', async () => {
    mockIsAacRemuxAvailable.mockReturnValue(true);
    mockRemuxAacToMp4.mockImplementation(
      async (_src: string, dest: string) => dest,
    );

    const result = await remuxTakeToSeekableContainer('file:///docs/take.aac');

    expect(mockRemuxAacToMp4).toHaveBeenCalledWith(
      'file:///docs/take.aac',
      'file:///docs/remux-merge-uuid.m4a',
    );
    expect(result).toBe('file:///docs/remux-merge-uuid.m4a');
  });

  it('returns the input unchanged when the native remuxer is unavailable', async () => {
    mockIsAacRemuxAvailable.mockReturnValue(false);

    const result = await remuxTakeToSeekableContainer('file:///docs/take.aac');

    expect(result).toBe('file:///docs/take.aac');
    expect(mockRemuxAacToMp4).not.toHaveBeenCalled();
  });

  it('falls back to the ADTS file and cleans up when the remux fails', async () => {
    mockIsAacRemuxAvailable.mockReturnValue(true);
    mockRemuxAacToMp4.mockRejectedValueOnce(new Error('muxer failed'));

    const result = await remuxTakeToSeekableContainer('file:///docs/take.aac');

    expect(result).toBe('file:///docs/take.aac');
    // The partial destination file is best-effort unlinked.
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});
