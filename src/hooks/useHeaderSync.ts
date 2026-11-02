import { useCallback, useEffect, useRef } from 'react';
import { useIsFocused, useRouter } from 'expo-router';
import { hrefs } from '../navigation/hrefs';
import { useGlobalSyncStatus } from './useGlobalSyncStatus';
import { useSyncStatus } from './useSyncStatus';

export type HeaderSync = ReturnType<typeof useHeaderSync>;

const unguarded = (run: () => void) => run();

/**
 * A header's sync cloud: the status, and opening the Sync page once per tap
 * until this screen is focused again. `guard` wraps the push, e.g. to confirm
 * leaving a take.
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
  const isSyncing = useGlobalSyncStatus(onSyncComplete);
  const { status, failedErrorText } = useSyncStatus({ isSyncing });
  const lockRef = useRef(false);

  useEffect(() => {
    if (isFocused) lockRef.current = false;
  }, [isFocused]);

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

  return { status, failedErrorText, openSync };
}
