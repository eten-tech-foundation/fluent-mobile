/**
 * Prepare for Offline — dev-only download URLs (#52 wiring until manifest API).
 *
 * **Security:** URLs are hardcoded public test fixtures (not user/API input).
 * Used only when `__DEV__` is true; production returns empty `sourceUrl`.
 * Files land in the app sandbox (`downloadStorage.ts`) and are not executed.
 * Review any URL change in PR — prefer team-owned fixtures if external hosts
 * are a concern. Replaced in production by per-resource `sourceUrl` from manifest.
 */
import { PrepareOfflineResourceKind } from '../../types/prepareOffline/types';

export interface MockDownloadSource {
  sourceUrl: string;
  fileExt: string;
}

const DEV_MOCK_SOURCES: Record<PrepareOfflineResourceKind, MockDownloadSource> =
  {
    text: {
      sourceUrl:
        'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      fileExt: 'pdf',
    },
    audio: {
      sourceUrl:
        'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      fileExt: 'mp3',
    },
    image: {
      sourceUrl:
        'https://static.wixstatic.com/media/046448_76b4a2424bde4b43beb678785f075411~mv2.png/v1/fill/w_168,h_51,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/ETEN-Logo-onLight_2x.png',
      fileExt: 'png',
    },
  };

export function getMockDownloadSource(
  kind: PrepareOfflineResourceKind,
): MockDownloadSource {
  if (__DEV__) {
    return DEV_MOCK_SOURCES[kind];
  }

  return { sourceUrl: '', fileExt: 'bin' };
}
