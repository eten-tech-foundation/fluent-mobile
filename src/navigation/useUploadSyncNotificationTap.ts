import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuthSession } from './AuthSessionProvider';
import {
  hrefForUploadSyncTap,
  isUploadSyncNotificationTap,
} from '../services/uploadProgressNotification';

function notificationData(
  notification: Notifications.Notification | undefined,
): unknown {
  return notification?.request.content.data;
}

function notificationId(
  notification: Notifications.Notification | undefined,
): string {
  return notification?.request.identifier ?? 'upload-sync';
}

/**
 * Opens Sync when the user taps the upload-progress system notification.
 * The foreground-service PendingIntent uses the real Sync href; this hook
 * covers the local-notification fallback and post-login retry.
 */
export function useUploadSyncNotificationTap(): void {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthSession();
  const openedSyncForId = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const openFromNotification = (
      notification: Notifications.Notification | undefined,
    ) => {
      if (!isUploadSyncNotificationTap(notificationData(notification))) {
        return;
      }
      const href = hrefForUploadSyncTap(isAuthenticated);
      const id = notificationId(notification);
      if (!isAuthenticated) {
        router.replace(href);
        return;
      }
      if (openedSyncForId.current === id) {
        return;
      }
      openedSyncForId.current = id;
      router.push(href);
    };

    openFromNotification(
      Notifications.getLastNotificationResponse()?.notification,
    );

    const subscription = Notifications.addNotificationResponseReceivedListener(
      response => {
        openFromNotification(response.notification);
      },
    );
    return () => {
      subscription.remove();
    };
  }, [isAuthenticated, isLoading, router]);
}
