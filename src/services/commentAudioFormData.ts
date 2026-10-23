/**
 * Multipart body for comment-owned audio create/reply
 * (fluent-api PR #459 `POST …/comments/audio`). Never uses verse-audio paths.
 */

import type { VerseAudioFilePart } from '../types/api/verseAudio';
import { verseAudioFileToBlob } from './verseAudioFormData';

export type CommentAudioFilePart = VerseAudioFilePart;

export type BuildCommentAudioFormDataParams = {
  file: Blob | CommentAudioFilePart;
  /** One-level audio reply; when set, caller anchor fields are omitted. */
  replyToCommentId?: number;
  anchorKind?: 'verse' | 'pericope';
  bibleTextId?: number;
  pericopeNumber?: string;
  /** Optional set id for pericope create (API459). */
  pericopeSetId?: number;
  durationSeconds?: number;
};

type FormDataWithFilename = FormData & {
  append(name: string, value: Blob, fileName?: string): void;
};

export function commentAudioUploadPath(chapterAssignmentId: number): string {
  return `/chapter-assignments/${chapterAssignmentId}/comments/audio`;
}

export async function buildCommentAudioFormData(
  params: BuildCommentAudioFormDataParams,
): Promise<FormData> {
  const formData = new FormData() as FormDataWithFilename;
  const { blob, filename } = await verseAudioFileToBlob(params.file);

  if (filename !== undefined) {
    formData.append('file', blob, filename);
  } else {
    formData.append('file', blob);
  }

  if (
    params.replyToCommentId !== undefined &&
    Number.isInteger(params.replyToCommentId) &&
    params.replyToCommentId > 0
  ) {
    formData.append('replyToCommentId', String(params.replyToCommentId));
    if (
      params.durationSeconds !== undefined &&
      Number.isFinite(params.durationSeconds)
    ) {
      formData.append('durationSeconds', String(params.durationSeconds));
    }
    return formData;
  }

  if (params.anchorKind === 'verse') {
    formData.append('anchorKind', 'verse');
    if (
      params.bibleTextId !== undefined &&
      Number.isInteger(params.bibleTextId) &&
      params.bibleTextId > 0
    ) {
      formData.append('bibleTextId', String(params.bibleTextId));
    }
  } else if (params.anchorKind === 'pericope') {
    formData.append('anchorKind', 'pericope');
    if (params.pericopeNumber !== undefined) {
      formData.append('pericopeNumber', params.pericopeNumber);
    }
    if (
      params.pericopeSetId !== undefined &&
      Number.isInteger(params.pericopeSetId) &&
      params.pericopeSetId > 0
    ) {
      formData.append('pericopeSetId', String(params.pericopeSetId));
    }
  }

  if (
    params.durationSeconds !== undefined &&
    Number.isFinite(params.durationSeconds)
  ) {
    formData.append('durationSeconds', String(params.durationSeconds));
  }

  return formData;
}
