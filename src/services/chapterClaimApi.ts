/**
 * Compile-time gate for claim HTTP. Live API enabled when `false`
 * (`fluent-api#272`). Set `true` only for offline/stub testing.
 */
export const CHAPTER_CLAIM_API_STUBBED = false;

export function isChapterClaimApiStubbed(): boolean {
  return CHAPTER_CLAIM_API_STUBBED;
}

export function chapterClaimPath(chapterAssignmentId: number): string {
  return `/chapter-assignments/${chapterAssignmentId}/claim`;
}
