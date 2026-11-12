import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useNavigation } from 'expo-router';
import {
  getUploadSessionSnapshot,
  setDraftingUploadHold,
} from '../services/uploadOrchestrator';
import { onUploadSessionEvent } from '../services/syncEvents';

function readDraftingHold(): boolean {
  try {
    return getUploadSessionSnapshot().holdReason === 'drafting';
  } catch {
    return false;
  }
}

/** Whether automatic uploads are waiting for drafting to end. */
export function useUploadsHeldForDrafting(): boolean {
  const [held, setHeld] = useState(readDraftingHold);
  useEffect(() => {
    setHeld(readDraftingHold());
    return onUploadSessionEvent(() => setHeld(readDraftingHold()));
  }, []);
  return held;
}

/**
 * Owners currently asking for the hold. Passage can push Drafting, so one
 * screen unmounting must not release a hold the other screen still wants.
 */
const holdOwners = new Set<symbol>();

function publishDraftingUploadHold() {
  void setDraftingUploadHold(holdOwners.size > 0);
}

/**
 * Hold automatic uploads while this screen is focused and the app is in the
 * foreground. Backgrounding releases the hold; `inactive` does not. Sync Now
 * bypasses the hold in the orchestrator. The desired hold survives an
 * account restart of the orchestrator.
 */
export function useDraftingUploadHold() {
  const navigation = useNavigation();
  const ownerRef = useRef(Symbol('drafting-upload-hold'));
  const screenFocusedRef = useRef(false);
  const appActiveRef = useRef(AppState.currentState === 'active');
  const syncDraftingUploadHold = useCallback(() => {
    const owner = ownerRef.current;
    if (screenFocusedRef.current && appActiveRef.current) {
      holdOwners.add(owner);
    } else {
      holdOwners.delete(owner);
    }
    publishDraftingUploadHold();
  }, []);

  useEffect(() => {
    const owner = ownerRef.current;
    const unsubFocus = navigation.addListener('focus', () => {
      screenFocusedRef.current = true;
      syncDraftingUploadHold();
    });
    const unsubBlur = navigation.addListener('blur', () => {
      screenFocusedRef.current = false;
      syncDraftingUploadHold();
    });
    const appStateSub = AppState.addEventListener('change', nextState => {
      // Match recordingAppState: ignore iOS `inactive` (Control Center).
      if (nextState === 'inactive') {
        return;
      }
      appActiveRef.current = nextState === 'active';
      syncDraftingUploadHold();
    });
    // `focus` does not fire when this effect runs after the screen is already
    // focused. Read the current state so Stop cannot upload before a later
    // focus event.
    screenFocusedRef.current = navigation.isFocused();
    syncDraftingUploadHold();
    return () => {
      unsubFocus();
      unsubBlur();
      appStateSub.remove();
      screenFocusedRef.current = false;
      holdOwners.delete(owner);
      publishDraftingUploadHold();
    };
  }, [navigation, syncDraftingUploadHold]);
}
