/**
 * Compile-time gate for claim HTTP. Keep `true` until fluent-api#280 (#272 claim
 * route) is deployed to `EXPO_PUBLIC_API_BASE_URL`. Set `false` after deploy.
 */
export const CHAPTER_CLAIM_API_STUBBED = true;

export function isChapterClaimApiStubbed(): boolean {
  return CHAPTER_CLAIM_API_STUBBED;
}

export function chapterClaimPath(chapterAssignmentId: number): string {
  return `/chapter-assignments/${chapterAssignmentId}/claim`;
}
