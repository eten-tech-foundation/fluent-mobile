/**
 * Prepare for Offline — mock download URLs until manifest API (#201).
 *
 * **Security:** URLs are hardcoded public test fixtures (not user/API input).
 * Files land in the app sandbox (`downloadStorage.ts`) and are not executed.
 * Replaced when per-resource `sourceUrl` comes from FluentAPI manifest.
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
  return DEV_MOCK_FILE_BYTES[kind];
}

export function getMockDownloadSource(
  kind: PrepareOfflineResourceKind,
): MockDownloadSource {
  return DEV_MOCK_SOURCES[kind];
}
