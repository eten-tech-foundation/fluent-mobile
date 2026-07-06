import { useCallback, useEffect } from 'react';
import { Alert, Linking } from 'react-native';
import { PermissionState } from '../../../../../hooks/useRecorder';
import { RecorderStatus } from '../../../../../types/recording/types';
import { GuardContext } from '../../../../../types/drafting/types';
import { logger } from '../../../../../utils/logger';

const log = logger.create('useRecordTabGuards');

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

async function discardPausedThen(
  discardPaused: () => Promise<void>,
  onSuccess: () => void,
) {
  try {
    await discardPaused();
    onSuccess();
  } catch (error) {
    log.warn('Failed to discard paused take', { error });
    Alert.alert(
      'Could not discard recording',
      'The paused take could not be removed. Try resuming it, or restart the app if the problem continues.',
    );
  }
}

function pausedMessage(context: GuardContext): string {
  switch (context) {
    case GuardContext.Verse:
      return 'Resume or discard the paused take before switching verses.';
    case GuardContext.Tab:
      return 'Resume or discard the paused take before switching tabs.';
    case GuardContext.Leave:
      return 'You have a paused recording. Resume it or discard the take before leaving.';
  }
}

function recordingMessage(context: GuardContext): string {
  switch (context) {
    case GuardContext.Tab:
      return 'You are actively recording. Discard the take before switching tabs.';
    case GuardContext.Leave:
    default:
      return 'You are actively recording. Discard the take before leaving.';
  }
}

function promptBeforeAction(
  status: RecorderStatus,
  context: GuardContext,
  discardPaused: () => Promise<void>,
  action: () => void,
) {
  if (status === RecorderStatus.Paused) {
    Alert.alert('Recording in progress', pausedMessage(context), [
      { text: 'Resume', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => discardPausedThen(discardPaused, action),
      },
    ]);
    return;
  }

  if (status === RecorderStatus.Recording) {
    Alert.alert('Recording in progress', recordingMessage(context), [
      { text: 'Keep recording', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => discardPausedThen(discardPaused, action),
      },
    ]);
    return;
  }

  action();
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
      if (status === RecorderStatus.Paused) {
        promptBeforeAction(status, GuardContext.Verse, discardPaused, action);
        return;
      }
      action();
    },
    [discardPaused, status],
  );

  const withTabSwitchGuard = useCallback(
    (action: () => void) => {
      promptBeforeAction(status, GuardContext.Tab, discardPaused, action);
    },
    [discardPaused, status],
  );

  useEffect(() => {
    if (status !== RecorderStatus.Paused && status !== RecorderStatus.Recording)
      return;

    const beforeRemove = (event: {
      preventDefault: () => void;
      data: { action: unknown };
    }) => {
      event.preventDefault();
      promptBeforeAction(status, GuardContext.Leave, discardPaused, () =>
        navigation.dispatch(event.data.action),
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

  return { withPausedGuard, withTabSwitchGuard, ensureMicPermission };
}
