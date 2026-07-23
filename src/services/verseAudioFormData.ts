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
 * Multipart body for `PUT /verse-audio/{projectUnitId}/{bibleTextId}`
 * (fluent-api PR #224). Path carries the IDs; body is `file` + optional
 * `durationSeconds` only.
 */
export function buildVerseAudioFormData(
  params: Pick<UploadVerseAudioParams, 'file' | 'durationSeconds'>,
): FormData {
  const formData = new FormData();

  if (isVerseAudioFilePart(params.file)) {
    // RN FormData accepts `{ uri, name, type }`; typings expect Blob/File.
    formData.append('file', params.file as unknown as Blob);
  } else {
    formData.append('file', params.file);
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
