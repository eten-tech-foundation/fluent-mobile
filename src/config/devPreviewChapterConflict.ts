/** Dev-only QA toggle for issue #269 manual conflict-banner step (never enable in production). */
export function isDevPreviewChapterConflictEnabled(): boolean {
  return (
    __DEV__ && process.env.EXPO_PUBLIC_DEV_PREVIEW_CHAPTER_CONFLICT === 'true'
  );
}
