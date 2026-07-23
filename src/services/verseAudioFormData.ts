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
 * Multipart body for `PUT /verse-audio/{projectUnitId}/{bibleTextId}`
 * (fluent-api PR #224). Path carries the IDs; body is `file` + optional
 * `durationSeconds` only.
 */
export async function buildVerseAudioFormData(
  params: Pick<UploadVerseAudioParams, 'file' | 'durationSeconds'>,
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

  return formData;
}

export function verseAudioUploadPath(
  projectUnitId: number,
  bibleTextId: number,
): string {
  return `/verse-audio/${projectUnitId}/${bibleTextId}`;
}
