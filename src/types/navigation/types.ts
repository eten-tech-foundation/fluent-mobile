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
    /**
     * When set (e.g. navigating from the home recovery prompt), the drafting
     * screen lands on this verse instead of the first-unrecorded default.
     */
    recoverVerse?: number;
  };
  PrivacyPolicy: undefined;
  TermsOfUse: undefined;
  ForgotPassword: { initialEmail?: string } | undefined;
};
