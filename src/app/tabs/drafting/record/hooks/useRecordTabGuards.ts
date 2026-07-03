import { useCallback, useEffect } from 'react';
import { Alert, Linking } from 'react-native';
import type {
  PermissionState,
  RecorderStatus,
} from '../../../../../hooks/useRecorder';

interface RecordTabNavigation {
  addListener: (
    event: 'beforeRemove',
    callback: (event: {
      preventDefault: () => void;
      data: { action: unknown };
    }) => void,
  ) => () => void;
  dispatch: (action: unknown) => void;
}

interface UseRecordTabGuardsArgs {
  status: RecorderStatus;
  permission: PermissionState;
  requestPermission: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  discardPaused: () => Promise<void>;
  navigation: RecordTabNavigation;
}

function showMicBlockedAlert() {
  Alert.alert(
    'Microphone access required',
    'Fluent needs microphone access to record verses. Enable it in Settings.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Go to Settings',
        onPress: () => {
          Linking.openSettings().catch(() => undefined);
        },
      },
    ],
  );
}

export function useRecordTabGuards({
  status,
  permission,
  requestPermission,
  discardPaused,
  navigation,
}: UseRecordTabGuardsArgs) {
  const withPausedGuard = useCallback(
    (action: () => void) => {
      if (status === 'paused') {
        Alert.alert(
          'Recording in progress',
          'Resume or discard the paused take before switching verses.',
          [
            { text: 'Resume', style: 'cancel' },
            {
              text: 'Discard',
              style: 'destructive',
              onPress: async () => {
                await discardPaused();
                action();
              },
            },
          ],
        );
        return;
      }
      action();
    },
    [discardPaused, status],
  );

  useEffect(() => {
    if (status !== 'paused') return;

    const beforeRemove = (event: {
      preventDefault: () => void;
      data: { action: unknown };
    }) => {
      event.preventDefault();
      Alert.alert(
        'Recording in progress',
        'You have a paused recording. Resume it or discard the take before leaving.',
        [
          { text: 'Resume', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: async () => {
              await discardPaused();
              navigation.dispatch(event.data.action);
            },
          },
        ],
      );
    };

    const unsubscribe = navigation.addListener('beforeRemove', beforeRemove);
    return unsubscribe;
  }, [discardPaused, navigation, status]);

  const ensureMicPermission = useCallback(async (): Promise<boolean> => {
    if (permission === 'granted') return true;
    if (permission === 'blocked') {
      showMicBlockedAlert();
      return false;
    }
    const { granted, canAskAgain } = await requestPermission();
    if (granted) return true;
    if (!canAskAgain) showMicBlockedAlert();
    return false;
  }, [permission, requestPermission]);

  return { withPausedGuard, ensureMicPermission };
}
