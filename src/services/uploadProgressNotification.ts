import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { logger } from '../utils/logger';
import { hrefs } from '../navigation/hrefs';
import { onUploadSessionEvent, type UploadSessionEvent } from './syncEvents';
import { getUploadSyncForegroundModule } from './uploadSyncForeground';

const log = logger.create('UploadProgressNotification');

export const UPLOAD_SYNC_NOTIFICATION_ID = 'upload-sync-progress';
export const UPLOAD_SYNC_NOTIFICATION_TITLE = 'Uploading your recordings';
export const UPLOAD_SYNC_CHANNEL_ID = 'upload-sync';
export const UPLOAD_SYNC_TAP_KIND = 'upload-sync';

export function formatUploadProgressBody(
  completed: number,
  total: number,
): string {
  return `${completed} of ${total} chapters uploaded`;
}

export type UploadNotificationCommand = 'show' | 'update' | 'clear' | 'noop';

/** Maps orchestrator session events to notification chrome (one notification id). */
export function commandForUploadSessionEvent(
  event: UploadSessionEvent,
): UploadNotificationCommand {
  switch (event.type) {
    case 'start':
      return 'show';
    case 'progress':
      return 'update';
    case 'paused':
    case 'cancelled':
    case 'complete':
    case 'idle':
      return 'clear';
    case 'waiting_wifi':
      return 'noop';
  }
}

type PresentationMode = 'none' | 'foreground-service' | 'local';

let unsubscribe: (() => void) | null = null;
let presentationMode: PresentationMode = 'none';
let permissionDenied = false;
let applyChain: Promise<void> = Promise.resolve();

function enqueue(work: () => Promise<void>): void {
  applyChain = applyChain.then(work).catch(error => {
    log.error('Upload notification update failed', { error: String(error) });
  });
}

async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }

  await Notifications.setNotificationChannelAsync(UPLOAD_SYNC_CHANNEL_ID, {
    name: 'Upload progress',
    importance: Notifications.AndroidImportance.LOW,
    enableVibrate: false,
    sound: null,
    showBadge: false,
  });

  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) {
    return true;
  }
  if (!existing.canAskAgain) {
    return false;
  }
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function presentLocal(title: string, body: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: UPLOAD_SYNC_NOTIFICATION_ID,
    content: {
      title,
      body,
      sticky: true,
      autoDismiss: false,
      sound: false,
      data: {
        kind: UPLOAD_SYNC_TAP_KIND,
      },
    },
    trigger: null,
  });
}

async function showOrUpdate(title: string, body: string): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  if (permissionDenied) {
    return;
  }

  if (presentationMode === 'none') {
    const granted = await ensureNotificationPermission();
    if (!granted) {
      permissionDenied = true;
      log.info(
        'Notification permission denied; continuing upload without shade notification',
      );
      return;
    }

    const native = getUploadSyncForegroundModule();
    if (native) {
      try {
        await native.start(title, body);
        presentationMode = 'foreground-service';
        log.info('Started upload foreground-service notification');
        return;
      } catch (error) {
        log.warn(
          'Foreground service failed; falling back to local system notification',
          { error: String(error) },
        );
      }
    }

    await presentLocal(title, body);
    presentationMode = 'local';
    log.info('Started upload local system notification');
    return;
  }

  if (presentationMode === 'foreground-service') {
    const native = getUploadSyncForegroundModule();
    if (native) {
      await native.update(title, body);
      return;
    }
    presentationMode = 'none';
    await showOrUpdate(title, body);
    return;
  }

  await presentLocal(title, body);
}

async function clearPresented(): Promise<void> {
  const mode = presentationMode;
  presentationMode = 'none';
  permissionDenied = false;

  if (mode === 'foreground-service') {
    const native = getUploadSyncForegroundModule();
    try {
      await native?.stop();
    } catch (error) {
      log.warn('Failed to stop upload foreground service', {
        error: String(error),
      });
    }
    log.info('Cleared upload foreground-service notification');
    return;
  }

  if (mode === 'local') {
    await Notifications.dismissNotificationAsync(UPLOAD_SYNC_NOTIFICATION_ID);
    log.info('Cleared upload local system notification');
  }
}

function applyEvent(event: UploadSessionEvent): void {
  const command = commandForUploadSessionEvent(event);
  if (command === 'noop') {
    return;
  }

  enqueue(async () => {
    if (command === 'clear') {
      await clearPresented();
      return;
    }

    const completed = event.type === 'progress' ? event.completedChapters : 0;
    const total =
      event.type === 'start'
        ? event.totalChapters
        : event.type === 'progress'
        ? event.totalChapters
        : 0;
    const body = formatUploadProgressBody(completed, total);
    await showOrUpdate(UPLOAD_SYNC_NOTIFICATION_TITLE, body);
  });
}

export function startUploadProgressNotification(): void {
  stopUploadProgressNotification();
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  unsubscribe = onUploadSessionEvent(applyEvent);
  log.info('Listening for upload session notification events');
}

export function stopUploadProgressNotification(): void {
  unsubscribe?.();
  unsubscribe = null;
  enqueue(async () => {
    await clearPresented();
  });
}

/** Wait for serialized notification I/O (unit tests). */
export async function waitForUploadNotificationIdle(): Promise<void> {
  await applyChain;
}

export function isUploadSyncNotificationTap(data: unknown): boolean {
  if (data === null || typeof data !== 'object') {
    return false;
  }
  return (data as { kind?: unknown }).kind === UPLOAD_SYNC_TAP_KIND;
}

export function hrefForUploadSyncTap(
  isAuthenticated: boolean,
): typeof hrefs.sync | typeof hrefs.login {
  return isAuthenticated ? hrefs.sync : hrefs.login;
}
