import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  useNavigation,
  usePreventRemove,
  type NativeStackNavigationProp,
} from 'expo-router';
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
 *
 * `onLeaveAttempt` runs when the route starts disappearing (a pop, or another
 * screen opening over it) and again when a removal is blocked by the prompt,
 * so callers can stop playback before the user answers.
 */
export function useRecordCaptureLeaveGuard(onLeaveAttempt?: () => void) {
  const navigation =
    useNavigation<NativeStackNavigationProp<Record<string, undefined>>>();
  const [recordCaptureActive, setRecordCaptureActive] = useState(false);
  // True once a discard has succeeded for the current capture, so the pop that
  // follows (and any later removal) passes the guard without a second prompt.
  const [leaveAllowed, setLeaveAllowed] = useState(false);
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
  // A fresh capture re-arms the guard even if a previous discard never
  // consumed its allowance (e.g. discard via tab change, so no pop follows).
  const onCaptureActiveChange = useCallback((active: boolean) => {
    setRecordCaptureActive(active);
    if (active) setLeaveAllowed(false);
  }, []);
  const discardPendingRemoval = useRef(false);
  const disablePreventionRef = useRef<() => void>(() => {});

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
            // A second removal while the discard is in flight stays blocked
            // without a new prompt. Reset the flag before continuing, since
            // the continuation can itself remove this route.
            discardPendingRemoval.current = true;
            void controls
              .discardCapture()
              .then(
                () => {
                  // Keep the prop and the hook in sync: state says leave is
                  // allowed, and the hook is disabled now so the continuation
                  // does not wait for the next render.
                  setLeaveAllowed(true);
                  disablePreventionRef.current();
                  return true;
                },
                () => false,
              )
              .finally(() => {
                discardPendingRemoval.current = false;
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

  const disablePrevention = usePreventRemove(
    recordCaptureActive && !leaveAllowed,
    ({ repeat }) => {
      onLeaveAttempt?.();
      if (discardPendingRemoval.current) return;
      alertRecordingInProgress(repeat);
    },
  );
  useEffect(() => {
    disablePreventionRef.current = disablePrevention;
  }, [disablePrevention]);

  // Playback should stop as soon as the screen starts disappearing (a pop, or
  // a push over it), not after the transition finishes.
  useEffect(() => {
    return navigation.addListener('transitionStart', event => {
      if (event.data.closing) onLeaveAttempt?.();
    });
  }, [navigation, onLeaveAttempt]);

  useEffect(() => {
    setRecordCaptureGate(recordCaptureActive);
    return () => {
      setRecordCaptureGate(false);
    };
  }, [recordCaptureActive]);

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
    onCaptureActiveChange,
    onRegisterCaptureControls,
    alertRecordingInProgress,
    guardAction,
  };
}
