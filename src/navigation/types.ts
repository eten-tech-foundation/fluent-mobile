export type RootStackParamList = {
  Projects: undefined;
  Chapters: {
    projectId: string;
    projectName: string;
    language: string;
  };
  VerseDetail: {
    chapterId: string;
    chapterName: string;
    projectName: string;
    language: string;
  };
};
