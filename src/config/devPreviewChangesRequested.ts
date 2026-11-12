/** Dev-only sample of Home's changes-requested card until the API can send a chapter back (never enable in production). */
export function isDevPreviewChangesRequestedEnabled(): boolean {
  return (
    __DEV__ && process.env.EXPO_PUBLIC_DEV_PREVIEW_CHANGES_REQUESTED === 'true'
  );
}
