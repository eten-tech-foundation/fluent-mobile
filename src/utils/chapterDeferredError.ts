/**
 * Thrown by a chapter upload pass that left takes deferred without failing
 * any, for example an account whose project membership could not be confirmed
 * (#855). The orchestrator keeps uploading the remaining chapters and fails
 * the session only after the loop, so no `complete` is emitted and the bounded
 * retry still runs.
 */
export const CHAPTER_UPLOAD_DEFERRED_ERROR_NAME = 'ChapterUploadDeferredError';

export function isChapterUploadDeferredError(error: unknown): boolean {
  return (
    error instanceof Error && error.name === CHAPTER_UPLOAD_DEFERRED_ERROR_NAME
  );
}

export class ChapterUploadDeferredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = CHAPTER_UPLOAD_DEFERRED_ERROR_NAME;
  }
}
