import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Thin binding to the local `AacRemux` native module (Android-only), which
 * repackages a raw ADTS AAC file into a seekable MP4 (`.m4a`) container without
 * re-encoding. The module is optional: on platforms/builds where it isn't
 * present (e.g. the Jest environment, or a build that hasn't been prebuilt),
 * {@link isAacRemuxAvailable} is `false` and callers fall back to the raw file.
 */
interface AacRemuxNativeModule {
  /** Remux `sourceUri` (ADTS `.aac`) into `destUri` (`.m4a`); resolves to `destUri`. */
  remuxToMp4(sourceUri: string, destUri: string): Promise<string>;
}

function loadNativeModule(): AacRemuxNativeModule | null {
  try {
    return requireOptionalNativeModule<AacRemuxNativeModule>('AacRemux');
  } catch {
    return null;
  }
}

const nativeModule = loadNativeModule();

/** True when the native remuxer is linked and callable on this platform/build. */
export function isAacRemuxAvailable(): boolean {
  return nativeModule !== null;
}

/**
 * Remux an ADTS AAC file into an MP4 container. Throws if the native module is
 * unavailable — callers that want a graceful fallback should guard with
 * {@link isAacRemuxAvailable} (see `remuxTakeToSeekableContainer`).
 */
export async function remuxAacToMp4(
  sourceUri: string,
  destUri: string,
): Promise<string> {
  if (!nativeModule) {
    throw new Error('AacRemux native module is unavailable');
  }
  return nativeModule.remuxToMp4(sourceUri, destUri);
}
