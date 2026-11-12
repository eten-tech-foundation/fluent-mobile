import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused, useRouter } from 'expo-router';
import { hrefs } from '../navigation/hrefs';
import { useUploadsHeldForDrafting } from './useDraftingUploadHold';
import { useGlobalSyncStatus } from './useGlobalSyncStatus';
import { useSyncStatus } from './useSyncStatus';

export type HeaderSync = ReturnType<typeof useHeaderSync>;

const unguarded = (run: () => void) => run();

/**
 * A header's sync cloud: the status, and opening the Sync page once per tap
 * until this screen is focused again. The missing-text count is re-read when
 * a sync finishes, when the screen is focused again, and when `refresh` is
 * called (a passage download does not emit sync events). `guard` wraps the
 * push, e.g. to confirm leaving a take.
 */
export function useHeaderSync({
  onSyncComplete,
  guard = unguarded,
}: {
  onSyncComplete?: () => void;
  guard?: (run: () => void) => void;
} = {}) {
  const router = useRouter();
  const isFocused = useIsFocused();
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey(key => key + 1), []);
  const onCompleteRef = useRef(onSyncComplete);
  onCompleteRef.current = onSyncComplete;
  const handleSyncComplete = useCallback(() => {
    refresh();
    onCompleteRef.current?.();
  }, [refresh]);
  const isSyncing = useGlobalSyncStatus(handleSyncComplete);
  const { status, failedErrorText } = useSyncStatus({ isSyncing, refreshKey });
  const heldForDrafting = useUploadsHeldForDrafting();
  const lockRef = useRef(false);
  const focusedOnce = useRef(false);

  useEffect(() => {
    if (!isFocused) return;
    lockRef.current = false;
    if (focusedOnce.current) {
      refresh();
      return;
    }
    focusedOnce.current = true;
  }, [isFocused, refresh]);

  const openSync = useCallback(() => {
    guard(() => {
      if (lockRef.current) return;
      lockRef.current = true;
      try {
        router.push(hrefs.sync);
      } catch {
        lockRef.current = false;
      }
    });
  }, [guard, router]);

  return { status, failedErrorText, heldForDrafting, openSync, refresh };
}
