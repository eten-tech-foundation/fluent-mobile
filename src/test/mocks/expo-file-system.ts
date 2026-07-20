type FileEntry = {
  exists: boolean;
  isDirectory: boolean;
  size: number;
  uri: string;
};

const files = new Map<string, string>();
const directories = new Set<string>();

export const documentDirectory = 'file:///mock-document/';
export const cacheDirectory = 'file:///mock-cache/';

export function resetFileSystemMock(): void {
  files.clear();
  directories.clear();
  directories.add(normalizeDir(documentDirectory));
  directories.add(normalizeDir(cacheDirectory));
}

function normalizePath(path: string): string {
  return path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function normalizeDir(path: string): string {
  const normalized = normalizePath(path);
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function resolveUri(uri: string): string {
  if (uri.startsWith('file://')) {
    return normalizePath(uri);
  }
  return normalizePath(`${documentDirectory}${uri.replace(/^\//, '')}`);
}

export async function getInfoAsync(
  uri: string,
  _options?: unknown,
): Promise<FileEntry> {
  const path = resolveUri(uri);
  if (directories.has(normalizeDir(path)) || directories.has(path)) {
    return { exists: true, isDirectory: true, size: 0, uri: path };
  }
  if (files.has(path)) {
    const content = files.get(path) ?? '';
    return {
      exists: true,
      isDirectory: false,
      size: content.length,
      uri: path,
    };
  }
  return { exists: false, isDirectory: false, size: 0, uri: path };
}

export async function makeDirectoryAsync(
  uri: string,
  _options?: unknown,
): Promise<void> {
  directories.add(normalizeDir(resolveUri(uri)));
}

export async function deleteAsync(
  uri: string,
  _options?: unknown,
): Promise<void> {
  const path = resolveUri(uri);
  files.delete(path);
  directories.delete(normalizeDir(path));
  directories.delete(path);
}

export async function writeAsStringAsync(
  uri: string,
  contents: string,
  _options?: unknown,
): Promise<void> {
  files.set(resolveUri(uri), contents);
}

export async function readAsStringAsync(
  uri: string,
  _options?: unknown,
): Promise<string> {
  const path = resolveUri(uri);
  if (!files.has(path)) {
    throw new Error(`File not found: ${path}`);
  }
  return files.get(path) ?? '';
}

export async function copyAsync(options: {
  from: string;
  to: string;
}): Promise<void> {
  const from = resolveUri(options.from);
  const to = resolveUri(options.to);
  const content = files.get(from) ?? '';
  files.set(to, content);
}

export async function moveAsync(options: {
  from: string;
  to: string;
}): Promise<void> {
  await copyAsync(options);
  await deleteAsync(options.from);
}

resetFileSystemMock();

/** Test-only helper to inspect stored files. */
export function __getFileSystemSnapshot(): ReadonlyMap<string, string> {
  return files;
}
