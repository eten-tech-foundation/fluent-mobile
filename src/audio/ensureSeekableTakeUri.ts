import { logger } from '../utils/logger';

const log = logger.create('seekableTake');

export type RemuxNativeModule = {
  remuxAacToM4a: (inputUri: string, outputUri: string) => Promise<string>;
};

/**
 * Ensure a committed take URI is seekable for Review scrubbing (#176).
 *
 * Capture may use ADTS `.aac` for kill-safe pause/resume. Scrubbing needs an
 * M4A with a `moov` atom. When a native remux module is available, convert;
 * otherwise keep the original URI playable (non-seekable) without data loss.
 *
 * HIGH_QUALITY `.m4a` captures are already seekable and pass through.
 */
export async function ensureSeekableTakeUri(
  uri: string,
  remux?: RemuxNativeModule | null,
): Promise<string> {
  const lower = uri.toLowerCase();
  if (!lower.endsWith('.aac')) {
    return uri;
  }

  if (!remux?.remuxAacToM4a) {
    log.warn(
      'ADTS take has no remux module; Review scrubbing may be inaccurate',
      { uri },
    );
    return uri;
  }

  const outputUri = uri.replace(/\.aac$/i, '.m4a');
  try {
    return await remux.remuxAacToM4a(uri, outputUri);
  } catch (error) {
    log.error('AAC→M4A remux failed; keeping original take', { error, uri });
    return uri;
  }
}
