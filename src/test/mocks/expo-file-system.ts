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

/** Mirrors `expo-file-system/legacy` EncodingType. */
export const EncodingType = {
  UTF8: 'utf8',
  Base64: 'base64',
} as const;

export function resetFileSystemMock(): void {
  files.clear();
  fileBytes.clear();
  directories.clear();
  directories.add(normalizeDir(documentDirectory));
  directories.add(normalizeDir(cacheDirectory));
}

function normalizePath(path: string): string {
  const schemeMatch = path.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)(.*)$/);
  if (schemeMatch) {
    const [, scheme, rest] = schemeMatch;
    const collapsedRest = rest.replace(/\/+/g, '/').replace(/\/$/, '');
    return `${scheme}${collapsedRest}`;
  }
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

/** Default mock free space for storage summary tests (#53). */
export const MOCK_FREE_DISK_BYTES = 8 * 1024 * 1024 * 1024;
export const MOCK_TOTAL_DISK_BYTES = 64 * 1024 * 1024 * 1024;

export async function getFreeDiskStorageAsync(): Promise<number> {
  return MOCK_FREE_DISK_BYTES;
}

export async function getTotalDiskCapacityAsync(): Promise<number> {
  return MOCK_TOTAL_DISK_BYTES;
}

const fileBytes = new Map<string, Uint8Array>();
let openHandles = 0;

/** Raw bytes served by `File#open` handles (falls back to string content). */
export function __setMockFileBytes(uri: string, bytes: Uint8Array): void {
  fileBytes.set(resolveUri(uri), bytes);
}

export function __getOpenFileHandleCount(): number {
  return openHandles;
}

export const FileMode = {
  ReadOnly: 'r',
  WriteOnly: 'w',
  ReadWrite: 'rw',
  Append: 'wa',
  Truncate: 'wt',
} as const;

function mockFileData(uri: string): Uint8Array {
  const path = resolveUri(uri);
  const content = files.get(path);
  const data =
    fileBytes.get(path) ??
    (content === undefined
      ? undefined
      : Uint8Array.from(content, ch => ch.charCodeAt(0) & 0xff));
  if (!data) throw new Error(`File not found: ${path}`);
  return data;
}

/** Subset of the SDK `File` class: whole-file bytes and read handles over mock content. */
export class File {
  constructor(readonly uri: string) {}

  open(_mode?: string) {
    const data = mockFileData(this.uri);
    let offset = 0;
    let open = true;
    openHandles += 1;
    return {
      get offset() {
        return offset;
      },
      size: data.length,
      readBytes(length: number): Uint8Array {
        if (!open) throw new Error('file handle is closed');
        const out = data.slice(offset, offset + length);
        offset += out.length;
        return out;
      },
      close() {
        if (open) openHandles -= 1;
        open = false;
      },
    };
  }
}

resetFileSystemMock();

/** Test-only helper to inspect stored files. */
export function __getFileSystemSnapshot(): ReadonlyMap<string, string> {
  return files;
}

export type DownloadProgressCallback = (progress: {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
}) => void;

export type DownloadResumable = {
  downloadAsync: () => Promise<{ uri: string } | undefined>;
  pauseAsync: () => Promise<DownloadPauseState>;
  resumeAsync: () => Promise<{ uri: string } | undefined>;
  savable: () => DownloadPauseState;
};

export type DownloadPauseState = {
  url: string;
  fileUri: string;
  options?: unknown;
  resumeData?: string;
};

const DEFAULT_MOCK_CONTENT = 'mock-downloaded-bytes';

export function createDownloadResumable(
  url: string,
  fileUri: string,
  options?: unknown,
  onProgress?: DownloadProgressCallback,
  resumeData?: string,
): DownloadResumable {
  const resolvedUri = resolveUri(fileUri);
  const savable = (): DownloadPauseState => ({
    url,
    fileUri: resolvedUri,
    options,
    resumeData,
  });
  return {
    downloadAsync: async () => {
      onProgress?.({
        totalBytesWritten: DEFAULT_MOCK_CONTENT.length,
        totalBytesExpectedToWrite: DEFAULT_MOCK_CONTENT.length,
      });
      files.set(resolvedUri, DEFAULT_MOCK_CONTENT);
      return { uri: resolvedUri };
    },
    pauseAsync: async () => savable(),
    resumeAsync: async () => {
      files.set(resolvedUri, DEFAULT_MOCK_CONTENT);
      return { uri: resolvedUri };
    },
    savable,
  };
}
