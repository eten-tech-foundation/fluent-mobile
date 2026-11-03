import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { hrefs } from '../navigation/hrefs';
import {
  RECORDING_IN_PROGRESS_MESSAGE,
  RECORDING_IN_PROGRESS_TITLE,
} from '../navigation/recordCaptureGate';
import { resetNavigationAfterAccountSwitch } from '../navigation/resetNavigationAfterAccountSwitch';
import { useRecordCaptureGate } from '../navigation/useRecordCaptureGate';
import {
  signOutCurrentDeviceAccount,
  switchToDeviceAccount,
} from '../services/accountSession';
import { confirmUnsyncedSignOut } from '../services/confirmUnsyncedSignOut';
import { getActiveUserId } from '../services/storage';
import { logger } from '../utils/logger';

const log = logger.create('useAccountActions');

export interface AccountActions {
  /** The account being switched to, while the switch runs. */
  switchingUserId: string | null;
  switchTo: (userId: string) => Promise<void>;
  addAccount: () => void;
  signOut: () => Promise<void>;
  /**
   * Closes and explains when a take is recording, which leaving would cut
   * off (#568). True when it blocked.
   */
  blockIfRecording: () => boolean;
}

/**
 * Switch, add and sign out of device accounts, for the menus that offer
 * them. `close` dismisses the menu before it navigates or alerts.
 */
export function useAccountActions({
  close,
  onUserSwitched,
  onSignOut,
}: {
  close: () => void;
  onUserSwitched?: () => void;
  onSignOut?: () => void;
}): AccountActions {
  const router = useRouter();
  const recordCaptureActive = useRecordCaptureGate();
  const [switchingUserId, setSwitchingUserId] = useState<string | null>(null);

  const blockIfRecording = useCallback(() => {
    if (!recordCaptureActive) return false;
    close();
    Alert.alert(RECORDING_IN_PROGRESS_TITLE, RECORDING_IN_PROGRESS_MESSAGE, [
      { text: 'OK' },
    ]);
    return true;
  }, [recordCaptureActive, close]);

  const addAccount = useCallback(() => {
    if (blockIfRecording()) return;
    close();
    router.push(hrefs.addUser);
  }, [blockIfRecording, close, router]);

  const switchTo = useCallback(
    async (userId: string) => {
      if (blockIfRecording()) return;
      if (userId === getActiveUserId() || switchingUserId) {
        close();
        return;
      }

      setSwitchingUserId(userId);
      try {
        await switchToDeviceAccount(userId);
        onUserSwitched?.();
        close();
        // Drop nested drafting/settings routes so the next account cannot land on
        // a blank white screen (#348).
        resetNavigationAfterAccountSwitch(router);
      } catch (error) {
        log.error('Account switch failed', { userId, error });
        close();
        Alert.alert(
          'Switch Failed',
          "Couldn't switch to that account. Its saved session may be corrupted — try adding it again.",
        );
      } finally {
        setSwitchingUserId(null);
      }
    },
    [blockIfRecording, switchingUserId, onUserSwitched, close, router],
  );

  const signOut = useCallback(async () => {
    if (blockIfRecording()) return;
    const confirmed = await confirmUnsyncedSignOut();
    if (!confirmed) return;
    close();
    try {
      const result = await signOutCurrentDeviceAccount();
      if (result.kind === 'switched') {
        onUserSwitched?.();
        resetNavigationAfterAccountSwitch(router);
        return;
      }
      onSignOut?.();
    } catch (error) {
      log.error('Sign out failed', { error });
      Alert.alert(
        'Sign Out Failed',
        "Couldn't sign out of this account. Please try again.",
      );
    }
  }, [blockIfRecording, close, onUserSwitched, onSignOut, router]);

  return { switchingUserId, switchTo, addAccount, signOut, blockIfRecording };
}
