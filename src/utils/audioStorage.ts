import * as FileSystem from 'expo-file-system/legacy';

/**
 * Local take files live under the app document directory as
 * `{documentDirectory}recordings/{recordingId}.m4a`.
 *
 * Path is keyed by `recordings.id` (stable TEXT PK) — never by project/book
 * display names. Persist the absolute URI to `recordings.local_file_path` and
 * read that column later; do not reconstruct paths from metadata.
 */
function recordingsDir(): string {
  const root = FileSystem.documentDirectory;
  if (!root) {
    throw new Error('FileSystem.documentDirectory is unavailable');
  }
  return `${root}recordings/`;
}

/** Ensure `{documentDirectory}recordings/` exists. */
export async function ensureRecordingsDir(): Promise<void> {
  const dir = recordingsDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

/**
 * Absolute file URI for a recording take.
 * @param recordingId - `recordings.id` (TEXT PK)
 */
export function recordingPath(recordingId: string): string {
  return `${recordingsDir()}${recordingId}.m4a`;
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
