import { Alert } from 'react-native';
import {
  ACCOUNT_SIGN_OUT_LABEL,
  LOGOUT_UNSYNCED_CANCEL,
  LOGOUT_UNSYNCED_MESSAGE,
  LOGOUT_UNSYNCED_TITLE,
} from '../constants/messages';
import { getUnsyncedRecordingCount } from '../db/queries';

/**
 * Shared sign-out guard (#622). Resolves true when sign-out should proceed.
 * A count of recordings not yet on the server, including pericope takes,
 * shows the same alert from the drawer and from More Settings.
 */
export async function confirmUnsyncedSignOut(): Promise<boolean> {
  const count = await getUnsyncedRecordingCount();
  if (count <= 0) {
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
        text: ACCOUNT_SIGN_OUT_LABEL,
        style: 'destructive',
        onPress: () => resolve(true),
      },
    ]);
  });
}
