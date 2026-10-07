import { Alert } from 'react-native';
import {
  LOGOUT_UNSYNCED_CANCEL,
  LOGOUT_UNSYNCED_CONFIRM,
  LOGOUT_UNSYNCED_MESSAGE,
  LOGOUT_UNSYNCED_TITLE,
} from '../constants/messages';
import { loadPendingUploadCount } from '../hooks/usePendingUploads';

/**
 * Sign-out guard (#620). Resolves true when sign-out should proceed.
 * A failed pending-count read is treated as possible unsynced work.
 */
export async function confirmUnsyncedLogout(): Promise<boolean> {
  let pendingCount: number | null;
  try {
    pendingCount = await loadPendingUploadCount();
  } catch {
    pendingCount = null;
  }

  if (pendingCount !== null && pendingCount <= 0) {
    return true;
  }

  return new Promise(resolve => {
    Alert.alert(LOGOUT_UNSYNCED_TITLE, LOGOUT_UNSYNCED_MESSAGE, [
      {
        text: LOGOUT_UNSYNCED_CANCEL,
        style: 'cancel',
        onPress: () => resolve(false),
      },
      {
        text: LOGOUT_UNSYNCED_CONFIRM,
        style: 'destructive',
        onPress: () => resolve(true),
      },
    ]);
  });
}
