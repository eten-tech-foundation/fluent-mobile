import * as FileSystem from 'expo-file-system/legacy';

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

function base64ToUint8Array(base64: string): Uint8Array {
  // Hermes / RN provide atob; typings on globalThis are incomplete here.
  const decode = (
    globalThis as typeof globalThis & { atob: (data: string) => string }
  ).atob;
  const binary = decode(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Expo winter `fetch` (`convertFormDataAsync`) accepts Blob or
 * `{ bytes(), name?, type? }`. React Native BlobManager cannot build Blobs
 * from ArrayBufferView (`Creating blobs from 'ArrayBuffer' and
 * 'ArrayBufferView' are not supported`), and `{ uri }` parts are also
 * rejected — so uri uploads must use a bytes-part.
 */
async function uriToExpoFilePart(file: VerseAudioFilePart): Promise<Blob> {
  const base64 = await FileSystem.readAsStringAsync(file.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToUint8Array(base64);
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
