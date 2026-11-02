import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import {
  CAPTURE_LEAVE_DISCARD,
  CAPTURE_LEAVE_MESSAGE,
  CAPTURE_LEAVE_RESUME,
  CAPTURE_LEAVE_TITLE,
  CAPTURE_SAVING_MESSAGE,
  CAPTURE_SAVING_TITLE,
} from '../constants/messages';
import { setRecordCaptureGate } from '../navigation/recordCaptureGate';
import type { CaptureControls } from '../types/captureControls';

/**
 * Capture gate and leave prompt for Legacy drafting and the Next passage
 * screen. While a take is recording, paused, recovered or saving, drawer and
 * account exits see the shared gate, and removing this route prompts first.
 */
export function useRecordCaptureLeaveGuard() {
  const router = useRouter();
  const navigation = useNavigation();
  const [recordCaptureActive, setRecordCaptureActive] = useState(false);
  const [captureControls, setCaptureControls] =
    useState<CaptureControls | null>(null);
  const controlsRef = useRef<CaptureControls | null>(null);
  const onRegisterCaptureControls = useCallback(
    (controls: CaptureControls | null) => {
      controlsRef.current = controls;
      setCaptureControls(controls);
    },
    [],
  );
  const suppressNextBeforeRemove = useRef(false);
  const discardPendingBeforeRemove = useRef(false);

  const alertRecordingInProgress = useCallback(
    (continueAfterDiscard?: () => void) => {
      const controls = controlsRef.current;
      if (!controls) {
        Alert.alert(CAPTURE_SAVING_TITLE, CAPTURE_SAVING_MESSAGE, [
          { text: 'OK', style: 'cancel' },
        ]);
        return;
      }
      Alert.alert(CAPTURE_LEAVE_TITLE, CAPTURE_LEAVE_MESSAGE, [
        { text: CAPTURE_LEAVE_RESUME, style: 'cancel' },
        {
          text: CAPTURE_LEAVE_DISCARD,
          style: 'destructive',
          onPress: () => {
            discardPendingBeforeRemove.current = true;
            // Reset the pending flag before continuing. router.back() emits
            // beforeRemove synchronously, and that listener bails while the
            // flag is set. Continue only after discard succeeds.
            void controls
              .discardCapture()
              .then(
                () => {
                  suppressNextBeforeRemove.current = true;
                  return true;
                },
                () => false,
              )
              .finally(() => {
                discardPendingBeforeRemove.current = false;
              })
              .then(succeeded => {
                if (succeeded) continueAfterDiscard?.();
              });
          },
        },
      ]);
    },
    [],
  );

  // A fresh capture re-arms the guard even if a previous discard never
  // consumed its suppression (e.g. discard via tab change — no pop follows).
  useEffect(() => {
    if (recordCaptureActive) {
      suppressNextBeforeRemove.current = false;
    }
  }, [recordCaptureActive]);

  useEffect(() => {
    setRecordCaptureGate(recordCaptureActive);
    return () => {
      setRecordCaptureGate(false);
    };
  }, [recordCaptureActive]);

  useEffect(() => {
    return navigation.addListener('beforeRemove', e => {
      if (discardPendingBeforeRemove.current) {
        e.preventDefault();
        return;
      }
      if (!recordCaptureActive) {
        return;
      }
      if (suppressNextBeforeRemove.current) {
        suppressNextBeforeRemove.current = false;
        return;
      }
      e.preventDefault();
      alertRecordingInProgress(() => router.back());
    });
  }, [alertRecordingInProgress, navigation, recordCaptureActive, router]);

  const guardAction = useCallback(
    (action: () => void) => {
      if (recordCaptureActive) {
        alertRecordingInProgress(action);
        return;
      }
      action();
    },
    [alertRecordingInProgress, recordCaptureActive],
  );

  return {
    recordCaptureActive,
    captureControls,
    onCaptureActiveChange: setRecordCaptureActive,
    onRegisterCaptureControls,
    alertRecordingInProgress,
    guardAction,
  };
}
