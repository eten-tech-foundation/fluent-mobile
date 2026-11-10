import { File } from 'expo-file-system';

import type {
  UploadVerseAudioParams,
  VerseAudioFilePart,
} from '../types/api/verseAudio';

function isVerseAudioFilePart(
  file: UploadVerseAudioParams['file'],
): file is VerseAudioFilePart {
  return (
    typeof file === 'object' &&
    file !== null &&
    'uri' in file &&
    typeof (file as VerseAudioFilePart).uri === 'string'
  );
}

/**
 * Expo winter `fetch` (`convertFormDataAsync`) accepts Blob or
 * `{ bytes(), name?, type? }`. React Native BlobManager cannot build Blobs
 * from ArrayBufferView (`Creating blobs from 'ArrayBuffer' and
 * 'ArrayBufferView' are not supported`), and `{ uri }` parts are also
 * rejected — so uri uploads must use a bytes-part. The bytes are read
 * natively; a base64 string plus a JS decode loop cost time linear in the
 * recording size on the JS thread.
 */
async function uriToExpoFilePart(file: VerseAudioFilePart): Promise<Blob> {
  const bytes = await new File(file.uri).bytes();
  return {
    name: file.name,
    type: file.type,
    bytes: () => bytes,
  } as unknown as Blob;
}

/**
 * Resolve the multipart file value for verse-audio upload.
 */
export async function verseAudioFileToBlob(
  file: UploadVerseAudioParams['file'],
): Promise<{ blob: Blob; filename?: string }> {
  if (!isVerseAudioFilePart(file)) {
    return { blob: file };
  }

  return {
    blob: await uriToExpoFilePart(file),
    filename: file.name,
  };
}

type FormDataWithFilename = FormData & {
  append(name: string, value: Blob, fileName?: string): void;
};

/**
 * Multipart body for verse-audio upload (fluent-api PR #271 / #377).
 * Path carries projectUnitId (+ bibleTextId for verse); body is `file` +
 * optional duration/token and pericope range fields (#584).
 */
export async function buildVerseAudioFormData(
  params: Pick<
    UploadVerseAudioParams,
    'file' | 'durationSeconds' | 'baseVersionToken'
  > &
    Partial<
      Pick<
        UploadVerseAudioParams,
        | 'granularity'
        | 'bibleTextId'
        | 'startChapter'
        | 'startVerse'
        | 'endChapter'
        | 'endVerse'
        | 'activate'
      >
    >,
): Promise<FormData> {
  const formData = new FormData() as FormDataWithFilename;
  const { blob, filename } = await verseAudioFileToBlob(params.file);

  if (filename !== undefined) {
    formData.append('file', blob, filename);
  } else {
    formData.append('file', blob);
  }

  if (
    params.durationSeconds !== undefined &&
    Number.isFinite(params.durationSeconds)
  ) {
    formData.append('durationSeconds', String(params.durationSeconds));
  }

  if (
    params.baseVersionToken !== undefined &&
    Number.isFinite(params.baseVersionToken)
  ) {
    formData.append('baseVersionToken', String(params.baseVersionToken));
  }

  if (params.activate !== undefined) {
    formData.append('activate', params.activate ? 'true' : 'false');
  }

  if (params.granularity === 'pericope') {
    formData.append('granularity', 'pericope');
    if (params.bibleTextId !== undefined) {
      formData.append('bibleTextId', String(params.bibleTextId));
    }
    const rangeFields: Array<
      [
        'startChapter' | 'startVerse' | 'endChapter' | 'endVerse',
        number | undefined,
      ]
    > = [
      ['startChapter', params.startChapter],
      ['startVerse', params.startVerse],
      ['endChapter', params.endChapter],
      ['endVerse', params.endVerse],
    ];
    for (const [name, value] of rangeFields) {
      if (value !== undefined && Number.isFinite(value)) {
        formData.append(name, String(value));
      }
    }
  }

  return formData;
}

export function verseAudioUploadPath(
  projectUnitId: number,
  bibleTextId: number,
): string {
  return `/verse-audio/${projectUnitId}/${bibleTextId}`;
}

/** Pericope / range upload path (fluent-api#377). */
export function verseAudioRangeUploadPath(projectUnitId: number): string {
  return `/verse-audio/${projectUnitId}/range`;
}

/** Per-take delete (fluent-api#465 / #716). */
export function verseAudioTakeDeletePath(
  projectUnitId: number,
  bibleTextId: number,
  takeId: number,
): string {
  return `/verse-audio/${projectUnitId}/${bibleTextId}/takes/${takeId}`;
}
