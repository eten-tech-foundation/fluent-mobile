const MAX_DISPLAY_LENGTH = 200;

const FILE_PATH_RE =
  /(?:file:\/\/)?(?:\/(?:data\/(?:user|data)|storage|sdcard|Users|home)[^\s]+|content:\/\/[^\s]+|(?:[A-Za-z]:\\|\\\\)[^\s]+)/gi;

export function sanitizeUploadErrorForDisplay(raw: string): string {
  const trimmed = raw.split('\n')[0]?.trim() ?? '';
  if (!trimmed) {
    return 'Upload failed';
  }

  if (/audio storage is unavailable/i.test(trimmed)) {
    return 'Audio storage is currently unavailable. Try again later.';
  }

  if (/\b404\b/.test(trimmed)) {
    return "Couldn't reach this recording on the server.";
  }

  const withoutPaths = trimmed
    .replace(FILE_PATH_RE, '')
    .replace(/\s+/g, ' ')
    .replace(/[:\s]+$/g, '')
    .trim();
  const cleaned = withoutPaths || 'Upload failed';

  if (cleaned.length <= MAX_DISPLAY_LENGTH) {
    return cleaned;
  }

  return `${cleaned.slice(0, MAX_DISPLAY_LENGTH - 1)}…`;
}
