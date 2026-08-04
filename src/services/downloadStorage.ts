import * as FileSystem from 'expo-file-system/legacy';

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

function assertSafePathSegment(value: string, label: string): void {
  if (!SAFE_SEGMENT.test(value)) {
    throw new Error(
      `Unsafe ${label} for download path: ${JSON.stringify(value)}`,
    );
  }
}

function downloadsProjectDir(projectId: number): string {
  const root = FileSystem.documentDirectory;
  if (!root) {
    throw new Error('FileSystem.documentDirectory is unavailable');
  }
  return `${root}downloads/${projectId}/`;
}

export async function ensureDownloadsDir(projectId: number): Promise<void> {
  const dir = downloadsProjectDir(projectId);
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

export function downloadResourcePath(
  projectId: number,
  resourceId: string,
  ext: string,
): string {
  assertSafePathSegment(resourceId, 'resourceId');
  assertSafePathSegment(ext, 'ext');
  return `${downloadsProjectDir(projectId)}${resourceId}.${ext}`;
}

export async function fileExists(path: string): Promise<boolean> {
  return (await FileSystem.getInfoAsync(path)).exists;
}

export async function deleteFile(path: string): Promise<void> {
  await FileSystem.deleteAsync(path, { idempotent: true });
}

export async function fileSize(path: string): Promise<number | undefined> {
  const info = await FileSystem.getInfoAsync(path);
  return info.exists ? info.size : undefined;
}

export async function downloadResourceFile(
  url: string,
  destPath: string,
  onProgress?: (fraction: number) => void,
): Promise<{ path: string; size: number }> {
  const downloadResumable = FileSystem.createDownloadResumable(
    url,
    destPath,
    {},
    downloadProgress => {
      const { totalBytesWritten, totalBytesExpectedToWrite } = downloadProgress;
      if (totalBytesExpectedToWrite > 0 && onProgress) {
        onProgress(totalBytesWritten / totalBytesExpectedToWrite);
      }
    },
  );

  const result = await downloadResumable.downloadAsync();
  if (!result) {
    throw new Error('Download did not complete');
  }

  const size = await fileSize(result.uri);
  return { path: result.uri, size: size ?? 0 };
}
