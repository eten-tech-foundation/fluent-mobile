/**
 * Legacy React Navigation stack param names (pre–Expo Router).
 * Prefer `hrefs` from `src/navigation/hrefs.ts` and Expo Router typed routes.
 * Kept as documentation of serializable param shapes for route screens.
 */
export type RootStackParamList = {
  Login: undefined;
  AddUser: undefined;
  Home: { newUserLoading?: boolean } | undefined;
  Settings: undefined;
  PrepareForOffline: { projectId?: number; projectName?: string } | undefined;
  Sync: undefined;
  Chapters: {
    projectId: number;
    projectName: string;
    language: string;
  };
  VerseDetail: {
    chapterId: number;
    chapterName: string;
    projectName: string;
    language: string;
  };
  PrivacyPolicy: undefined;
  TermsOfUse: undefined;
  ForgotPassword: { initialEmail?: string } | undefined;
};
