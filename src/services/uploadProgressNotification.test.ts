import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { emitUploadSessionEvent } from './syncEvents';
import { getUploadSyncForegroundModule } from './uploadSyncForeground';
import {
  commandForUploadSessionEvent,
  formatUploadProgressBody,
  hrefForUploadSyncTap,
  isUploadSyncNotificationTap,
  startUploadProgressNotification,
  stopUploadProgressNotification,
  waitForUploadNotificationIdle,
  UPLOAD_SYNC_NOTIFICATION_TITLE,
} from './uploadProgressNotification';

jest.mock('expo-notifications', () => ({
  AndroidImportance: { LOW: 2 },
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({
    granted: true,
    canAskAgain: true,
    status: 'granted',
  })),
  requestPermissionsAsync: jest.fn(async () => ({
    granted: true,
    canAskAgain: true,
    status: 'granted',
  })),
  scheduleNotificationAsync: jest.fn(async () => 'local-id'),
  dismissNotificationAsync: jest.fn(async () => undefined),
  setNotificationHandler: jest.fn(),
}));

const mockStart = jest.fn(async () => undefined);
const mockUpdate = jest.fn(async () => undefined);
const mockStop = jest.fn(async () => undefined);

jest.mock('./uploadSyncForeground', () => ({
  getUploadSyncForegroundModule: jest.fn(),
}));

const mockedNotifications = jest.mocked(Notifications);
const mockedGetNative = jest.mocked(getUploadSyncForegroundModule);

describe('upload progress notification mapping', () => {
  it('formats the shade body from completed/total chapter counts', () => {
    expect(formatUploadProgressBody(0, 4)).toBe('0 of 4 chapters uploaded');
    expect(formatUploadProgressBody(2, 4)).toBe('2 of 4 chapters uploaded');
  });

  it('shows on start, updates on progress, and clears on terminal events', () => {
    expect(
      commandForUploadSessionEvent({ type: 'start', totalChapters: 3 }),
    ).toBe('show');
    expect(
      commandForUploadSessionEvent({
        type: 'progress',
        completedChapters: 1,
        totalChapters: 3,
      }),
    ).toBe('update');
    expect(
      commandForUploadSessionEvent({ type: 'paused', reason: 'user' }),
    ).toBe('clear');
    expect(commandForUploadSessionEvent({ type: 'cancelled' })).toBe('clear');
    expect(commandForUploadSessionEvent({ type: 'complete' })).toBe('clear');
    expect(commandForUploadSessionEvent({ type: 'idle' })).toBe('clear');
    expect(commandForUploadSessionEvent({ type: 'waiting_wifi' })).toBe('noop');
  });

  it('recognizes upload-sync notification tap payloads', () => {
    expect(isUploadSyncNotificationTap({ kind: 'upload-sync' })).toBe(true);
    expect(isUploadSyncNotificationTap({ kind: 'other' })).toBe(false);
    expect(isUploadSyncNotificationTap(undefined)).toBe(false);
    expect(hrefForUploadSyncTap(true)).toBe('/(app)/(stack)/sync');
    expect(hrefForUploadSyncTap(false)).toBe('/(auth)/login');
  });
});

describe('upload progress notification presentation', () => {
  const originalOs = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { get: () => 'android' });
    mockedGetNative.mockReturnValue({
      start: mockStart,
      update: mockUpdate,
      stop: mockStop,
    });
    mockedNotifications.getPermissionsAsync.mockResolvedValue({
      granted: true,
      canAskAgain: true,
      status: 'granted',
      expires: 'never',
    } as Notifications.NotificationPermissionsStatus);
    startUploadProgressNotification();
  });

  afterEach(async () => {
    stopUploadProgressNotification();
    await waitForUploadNotificationIdle();
    Object.defineProperty(Platform, 'OS', { get: () => originalOs });
  });

  it('starts the foreground-service notification on session start', async () => {
    emitUploadSessionEvent({ type: 'start', totalChapters: 3 });
    await waitForUploadNotificationIdle();

    expect(mockStart).toHaveBeenCalledWith(
      UPLOAD_SYNC_NOTIFICATION_TITLE,
      '0 of 3 chapters uploaded',
    );
    expect(
      mockedNotifications.scheduleNotificationAsync,
    ).not.toHaveBeenCalled();
  });

  it('updates the same notification as chapters complete', async () => {
    emitUploadSessionEvent({ type: 'start', totalChapters: 2 });
    emitUploadSessionEvent({
      type: 'progress',
      completedChapters: 1,
      totalChapters: 2,
    });
    await waitForUploadNotificationIdle();

    expect(mockUpdate).toHaveBeenCalledWith(
      UPLOAD_SYNC_NOTIFICATION_TITLE,
      '1 of 2 chapters uploaded',
    );
  });

  it('clears the notification on pause', async () => {
    emitUploadSessionEvent({ type: 'start', totalChapters: 1 });
    emitUploadSessionEvent({ type: 'paused', reason: 'user' });
    await waitForUploadNotificationIdle();

    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it('continues uploading without a notification when permission is denied', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: false,
      status: 'denied',
      expires: 'never',
    } as Notifications.NotificationPermissionsStatus);
    stopUploadProgressNotification();
    await waitForUploadNotificationIdle();
    startUploadProgressNotification();

    emitUploadSessionEvent({ type: 'start', totalChapters: 1 });
    await waitForUploadNotificationIdle();

    expect(mockStart).not.toHaveBeenCalled();
    expect(
      mockedNotifications.scheduleNotificationAsync,
    ).not.toHaveBeenCalled();
  });

  it('falls back to a local system notification when the foreground service fails', async () => {
    mockStart.mockRejectedValueOnce(
      new Error('ForegroundServiceStartNotAllowed'),
    );
    emitUploadSessionEvent({ type: 'start', totalChapters: 1 });
    await waitForUploadNotificationIdle();

    expect(mockedNotifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: UPLOAD_SYNC_NOTIFICATION_TITLE,
          body: '0 of 1 chapters uploaded',
          sticky: true,
        }),
      }),
    );
  });
});
