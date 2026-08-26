import { requireOptionalNativeModule } from 'expo';

export type UploadSyncForegroundNativeModule = {
  start: (title: string, body: string) => Promise<void>;
  update: (title: string, body: string) => Promise<void>;
  stop: () => Promise<void>;
};

/**
 * Optional binding to the local `UploadSyncForeground` Expo module
 * (Android dataSync foreground service). Returns `null` when the native
 * module is not linked (Jest, or a JS-only bundle that hasn't been
 * prebuilt with `modules/upload-sync-foreground`).
 */
export function getUploadSyncForegroundModule(): UploadSyncForegroundNativeModule | null {
  try {
    const native =
      requireOptionalNativeModule<UploadSyncForegroundNativeModule>(
        'UploadSyncForeground',
      );
    if (!native?.start || !native?.update || !native?.stop) {
      return null;
    }
    return {
      start: (title, body) => native.start(title, body),
      update: (title, body) => native.update(title, body),
      stop: () => native.stop(),
    };
  } catch {
    return null;
  }
}
