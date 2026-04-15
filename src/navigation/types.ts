export type RootStackParamList = {
  Projects: undefined;
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
