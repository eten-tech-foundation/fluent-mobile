import RNFS from 'react-native-fs';

function safeName(raw: string | number): string {
  return String(raw)
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .trim();
}

export async function getVerseAudioPath(
  projectName: string,
  bookCode: string | number,
  chapterNumber: number,
  verseNumber: number,
): Promise<string> {
  const root = RNFS.DocumentDirectoryPath;

  const dirs = [
    `${root}/Projects`,
    `${root}/Projects/${safeName(projectName)}`,
    `${root}/Projects/${safeName(projectName)}/audio`,
    `${root}/Projects/${safeName(projectName)}/audio/${safeName(bookCode)}`,
    `${root}/Projects/${safeName(projectName)}/audio/${safeName(
      bookCode,
    )}/${chapterNumber}`,
  ];

  for (const dir of dirs) {
    if (!(await RNFS.exists(dir))) {
      await RNFS.mkdir(dir);
    }
  }

  return `${dirs[dirs.length - 1]}/${verseNumber}.m4a`;
}

export async function verseAudioExists(path: string): Promise<boolean> {
  return RNFS.exists(path);
}

export async function deleteVerseAudio(path: string): Promise<void> {
  if (await RNFS.exists(path)) {
    await RNFS.unlink(path);
  }
}

export async function getExistingChapterAudio(
  projectName: string,
  bookCode: string | number,
  chapterNumber: number,
): Promise<Map<number, string>> {
  const root = RNFS.DocumentDirectoryPath;
  const chapterDir = `${root}/Projects/${safeName(
    projectName,
  )}/audio/${safeName(bookCode)}/${chapterNumber}`;

  const result = new Map<number, string>();

  if (!(await RNFS.exists(chapterDir))) {
    return result;
  }

  const items = await RNFS.readDir(chapterDir);
  for (const item of items) {
    if (item.isFile() && item.name.endsWith('.m4a')) {
      const verseNumber = parseInt(item.name.replace('.m4a', ''), 10);
      if (!isNaN(verseNumber)) {
        result.set(verseNumber, item.path);
      }
    }
  }

  return result;
}
