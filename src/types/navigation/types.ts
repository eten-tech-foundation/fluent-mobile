export type RootStackParamList = {
  Login: undefined;
  AddUser: undefined;
  Home: { newUserLoading?: boolean } | undefined;
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
};
