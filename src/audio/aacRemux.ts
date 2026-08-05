import { requireOptionalNativeModule } from 'expo';
import type { RemuxNativeModule } from './ensureSeekableTakeUri';

/**
 * Optional binding to the local `AacRemux` Expo module (Android MediaMuxer).
 * Returns `null` when the native module is not linked (Jest, Expo Go, or a
 * JS-only bundle that hasn't been prebuilt with `modules/aac-remux`).
 */
export function getRemuxNativeModule(): RemuxNativeModule | null {
  try {
    const native = requireOptionalNativeModule<RemuxNativeModule>('AacRemux');
    if (!native?.remuxAacToM4a) {
      return null;
    }
    return {
      remuxAacToM4a: (inputUri, outputUri) =>
        native.remuxAacToM4a(inputUri, outputUri),
    };
  } catch {
    return null;
  }
}
