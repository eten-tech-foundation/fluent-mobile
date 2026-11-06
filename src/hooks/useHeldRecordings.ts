import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  getHeldRecordings,
  type HeldRecording,
} from '../db/repositories/heldRecordingsRepository';
import { getActiveUserId } from '../services/storage';
import { onUploadSessionEvent } from '../services/syncEvents';

/**
 * Sync page held-work list (#855): takes kept on the device because the
 * recording account was removed from the project. Reloads on focus, when the
 * parent bumps `refreshKey`, and after an upload session finishes so uploaded
 * takes drop out of the list.
 */
export function useHeldRecordings(refreshKey = 0): {
  recordings: HeldRecording[];
  loading: boolean;
} {
  const [recordings, setRecordings] = useState<HeldRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const generationRef = useRef(0);

  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    const userId = Number(getActiveUserId());
    if (!Number.isFinite(userId) || userId <= 0) {
      if (generation === generationRef.current) {
        setRecordings([]);
        setLoading(false);
      }
      return;
    }

    const rows = await getHeldRecordings(userId);
    if (generation !== generationRef.current) {
      return;
    }
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

  return { recordings, loading };
}
