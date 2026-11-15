import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  getHeldRecordings,
  type HeldRecording,
} from '../db/repositories/heldRecordingsRepository';
import { getActiveUserId } from '../services/storage';
import {
  onHeldRecordingsChanged,
  onUploadSessionEvent,
} from '../services/syncEvents';

/**
 * Sync page held-work list (#855): takes kept on the device because the
 * recording account was removed from the project. Reloads on focus, when the
 * parent bumps `refreshKey`, and after an upload session finishes so uploaded
 * takes drop out of the list, and when a reconcile holds or releases takes.
 */
export function useHeldRecordings(refreshKey = 0): {
  recordings: HeldRecording[];
  loading: boolean;
} {
  const [recordings, setRecordings] = useState<HeldRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const generationRef = useRef(0);
  // Account whose rows are currently on screen.
  const ownerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    const userId = Number(getActiveUserId());
    if (!Number.isFinite(userId) || userId <= 0) {
      if (generation === generationRef.current) {
        ownerRef.current = null;
        setRecordings([]);
        setLoading(false);
      }
      return;
    }

    // Held takes belong to the account that recorded them: never keep showing
    // the previous account's rows once another account is active.
    if (ownerRef.current !== null && ownerRef.current !== userId) {
      ownerRef.current = null;
      setRecordings([]);
    }
    const rows = await getHeldRecordings(userId);
    // A load for an account that is no longer active must not publish.
    if (
      generation !== generationRef.current ||
      Number(getActiveUserId()) !== userId
    ) {
      return;
    }
    ownerRef.current = userId;
    setRecordings(rows);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(
    () =>
      onUploadSessionEvent(event => {
        if (event.type === 'complete' || event.type === 'idle') {
          void load();
        }
      }),
    [load],
  );

  useEffect(
    () =>
      onHeldRecordingsChanged(() => {
        void load();
      }),
    [load],
  );

  return { recordings, loading };
}
