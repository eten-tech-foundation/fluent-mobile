export type RootStackParamList = {
  Home: undefined;
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
};
