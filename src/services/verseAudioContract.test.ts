import {
  verseAudioBlobKey,
  type VerseAudioResponse,
} from '../types/api/verseAudio';
import { ApiError } from '../types/api/errors';
import {
  blobKeyFromVerseAudioResponse,
  outcomeFromVerseAudioFailure,
  outcomeFromVerseAudioSuccess,
  parseVerseAudioResponse,
} from './verseAudioContract';

const validResponse: VerseAudioResponse = {
  id: 9,
  projectUnitId: 12,
  bibleTextId: 3401,
  uploadedBy: 3,
  contentType: 'audio/mp4',
  sizeBytes: 4096,
  durationSeconds: 12.5,
  verseNumber: 1,
  downloadUrl: 'https://example.test/sas',
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
};

describe('verseAudioContract', () => {
  it('maps success to blob_key matching server audioBlobName', () => {
    expect(verseAudioBlobKey(12, 3401)).toBe('unit-12/text-3401');
    expect(blobKeyFromVerseAudioResponse(validResponse)).toBe(
      'unit-12/text-3401',
    );
    expect(outcomeFromVerseAudioSuccess(validResponse)).toEqual({
      kind: 'uploaded',
      blobKey: 'unit-12/text-3401',
      recordingId: 9,
    });
  });

  it('treats 4xx as terminal failed', () => {
    expect(
      outcomeFromVerseAudioFailure(new ApiError(400, 'Missing audio file')),
    ).toEqual({
      kind: 'failed',
      message: 'Missing audio file',
      retryable: false,
    });
    expect(
      outcomeFromVerseAudioFailure(
        new ApiError(413, 'Audio file exceeds the 30 MB limit'),
      ),
    ).toMatchObject({ kind: 'failed', retryable: false });
  });

  it('treats 503 storage-unavailable as terminal failed (no retry loop)', () => {
    expect(
      outcomeFromVerseAudioFailure(
        new ApiError(
          503,
          'Verse audio is not available: Audio storage is not configured',
        ),
      ),
    ).toEqual({
      kind: 'failed',
      message: 'Verse audio is not available: Audio storage is not configured',
      retryable: false,
    });
  });

  it('treats other 5xx and network as retryable', () => {
    expect(
      outcomeFromVerseAudioFailure(new ApiError(500, 'Internal server error')),
    ).toEqual({
      kind: 'retryable',
      message: 'Internal server error',
      retryable: true,
    });
    expect(
      outcomeFromVerseAudioFailure(new ApiError(0, 'Network request failed')),
    ).toMatchObject({ kind: 'retryable', retryable: true });
  });

  it('parses a valid verse audio payload', () => {
    expect(parseVerseAudioResponse(validResponse)).toEqual(validResponse);
  });

  it('rejects malformed success bodies', () => {
    expect(() => parseVerseAudioResponse(null)).toThrow(ApiError);
    expect(() => parseVerseAudioResponse({})).toThrow(/missing id/);
    expect(() =>
      parseVerseAudioResponse({
        ...validResponse,
        downloadUrl: '',
      }),
    ).toThrow(/downloadUrl/);
    expect(() =>
      parseVerseAudioResponse({
        ...validResponse,
        contentType: 1,
      }),
    ).toThrow(/contentType/);
  });

  it('allows null durationSeconds', () => {
    expect(
      parseVerseAudioResponse({ ...validResponse, durationSeconds: null })
        .durationSeconds,
    ).toBeNull();
  });
});
