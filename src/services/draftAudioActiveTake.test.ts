import { ApiError } from '../types/api/errors';
import type { VerseAudioResponse } from '../types/api/verseAudio';
import {
  contentTypeToAudioExt,
  resolveActiveTakeDownload,
} from './draftAudioActiveTake';

const take = (id: number, url = `https://example.test/t${id}`) => ({
  id,
  uploadedBy: 3,
  contentType: 'audio/mp4',
  sizeBytes: 2048,
  durationSeconds: 12.5,
  contentHash: `hash-${id}`,
  downloadUrl: url,
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
});

const base: VerseAudioResponse = {
  id: 9,
  projectUnitId: 12,
  bibleTextId: 3401,
  uploadedBy: 3,
  contentType: 'audio/mp4',
  sizeBytes: 4096,
  durationSeconds: 12.5,
  versionToken: 2,
  conflictStatus: 'clean',
  activeTakeId: 10,
  takes: [take(10), take(11, 'https://example.test/last')],
  verseNumber: 1,
  downloadUrl: 'https://example.test/top-level-fallback',
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
};

describe('resolveActiveTakeDownload', () => {
  it('uses exact take.id === activeTakeId downloadUrl', () => {
    const resolved = resolveActiveTakeDownload(base);
    expect(resolved.take.id).toBe(10);
    expect(resolved.take.downloadUrl).toBe('https://example.test/t10');
    expect(resolved.conflictStatus).toBe('clean');
    expect(resolved.coverage).toBeNull();
  });

  it('rejects null activeTakeId instead of top-level / last-take fallback', () => {
    expect(() =>
      resolveActiveTakeDownload({ ...base, activeTakeId: null }),
    ).toThrow(ApiError);
    expect(() =>
      resolveActiveTakeDownload({ ...base, activeTakeId: null }),
    ).toThrow(/no activeTakeId/);
  });

  it('rejects mismatched activeTakeId not present in takes[]', () => {
    expect(() =>
      resolveActiveTakeDownload({ ...base, activeTakeId: 99 }),
    ).toThrow(/not present in takes/);
  });

  it('rejects empty takes without inventing a take', () => {
    expect(() =>
      resolveActiveTakeDownload({
        ...base,
        activeTakeId: 10,
        takes: [],
        downloadUrl: null,
      }),
    ).toThrow(/not present in takes/);
  });

  it('preserves conflict status without inventing product behavior', () => {
    const resolved = resolveActiveTakeDownload({
      ...base,
      conflictStatus: 'conflict',
    });
    expect(resolved.conflictStatus).toBe('conflict');
  });

  it('selects older non-last active over newer different-granularity take', () => {
    const resolved = resolveActiveTakeDownload({
      ...base,
      activeTakeId: 10,
      downloadUrl: 'https://example.test/t10',
      takes: [
        {
          ...take(10),
          granularity: 'verse',
          startChapter: 1,
          startVerse: 3,
          endChapter: 1,
          endVerse: 3,
        },
        {
          ...take(20, 'https://example.test/t20'),
          granularity: 'pericope',
          startChapter: 1,
          startVerse: 3,
          endChapter: 1,
          endVerse: 8,
        },
      ],
    });
    expect(resolved.take.id).toBe(10);
    expect(resolved.take.contentHash).toBe('hash-10');
    expect(resolved.coverage).toEqual({
      granularity: 'verse',
      startChapter: 1,
      startVerse: 3,
      endChapter: 1,
      endVerse: 3,
    });
  });

  it('maps content types to file extensions', () => {
    expect(contentTypeToAudioExt('audio/mpeg')).toBe('mp3');
    expect(contentTypeToAudioExt('audio/mp4')).toBe('m4a');
    expect(contentTypeToAudioExt('audio/wav')).toBe('wav');
  });
});
