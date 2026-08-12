/**
 * Prepare for Offline — dev-only download URLs (#52 wiring until manifest API).
 *
 * **Security:** URLs are hardcoded public test fixtures (not user/API input).
 * Used only when `__DEV__` is true; production returns empty `sourceUrl`.
 * Files land in the app sandbox (`downloadStorage.ts`) and are not executed.
 * Review any URL change in PR — prefer team-owned fixtures if external hosts
 * are a concern. Replaced in production by per-resource `sourceUrl` from manifest.
 *
 * `DEV_MOCK_FILE_BYTES` must match the on-disk size of each fixture URL so
 * catalog totals align with Manage Device Storage after download.
 */
import { PrepareOfflineResourceKind } from '../../types/prepareOffline/types';

export interface MockDownloadSource {
  sourceUrl: string;
  fileExt: string;
  bytesTotal: number;
}

/** Measured from live fixture downloads (Aug 2026). */
export const DEV_MOCK_FILE_BYTES = {
  text: 13_264,
  audio: 8_945_229,
  image: 9_266,
} as const satisfies Record<PrepareOfflineResourceKind, number>;

const DEV_MOCK_SOURCES: Record<PrepareOfflineResourceKind, MockDownloadSource> =
  {
    text: {
      sourceUrl:
        'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      fileExt: 'pdf',
      bytesTotal: DEV_MOCK_FILE_BYTES.text,
    },
    audio: {
      sourceUrl:
        'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      fileExt: 'mp3',
      bytesTotal: DEV_MOCK_FILE_BYTES.audio,
    },
    image: {
      sourceUrl:
        'https://static.wixstatic.com/media/046448_76b4a2424bde4b43beb678785f075411~mv2.png/v1/fill/w_168,h_51,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/ETEN-Logo-onLight_2x.png',
      fileExt: 'png',
      bytesTotal: DEV_MOCK_FILE_BYTES.image,
    },
  };

export function getMockDownloadBytesForKind(
  kind: PrepareOfflineResourceKind,
): number {
  if (__DEV__) {
    return DEV_MOCK_FILE_BYTES[kind];
  }

  return 0;
}

export function getMockDownloadSource(
  kind: PrepareOfflineResourceKind,
): MockDownloadSource {
  if (__DEV__) {
    return DEV_MOCK_SOURCES[kind];
  }

  return { sourceUrl: '', fileExt: 'bin', bytesTotal: 0 };
}
