import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuthSession } from '../navigation/AuthSessionProvider';
import {
  getHeldRecordings,
  type HeldRecording,
} from '../db/repositories/heldRecordingsRepository';
import { getActiveUserId } from '../services/storage';
import {
  onHeldRecordingsChanged,
  onUploadSessionEvent,
} from '../services/syncEvents';

const NO_HELD_RECORDINGS: HeldRecording[] = [];

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
  // Rows are stored with the account that owns them, so a render after an
  // account switch can never show another account's held takes, even before
  // the next load runs (or if the screen stays mounted through the switch).
  const [held, setHeld] = useState<{
    owner: number;
    rows: HeldRecording[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const generationRef = useRef(0);
  // Bumped after a device-account switch (notifyUserSwitched), so a Sync screen
  // that stays mounted through the switch reloads for the new account.
  const { userSwitchEpoch } = useAuthSession();

  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    const userId = Number(getActiveUserId());
    if (!Number.isFinite(userId) || userId <= 0) {
      if (generation === generationRef.current) {
        setHeld(null);
        setLoading(false);
      }
      return;
    }

    // Release the previous account's rows as soon as another account loads.
    setHeld(prev => (prev && prev.owner !== userId ? null : prev));
    const rows = await getHeldRecordings(userId);
    // A load for an account that is no longer active must not publish.
    if (
      generation !== generationRef.current ||
      Number(getActiveUserId()) !== userId
    ) {
      return;
    }
    setHeld({ owner: userId, rows });
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    void load();
  }, [load, refreshKey, userSwitchEpoch]);

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

  const activeUserId = Number(getActiveUserId());
  const recordings =
    held && held.owner === activeUserId ? held.rows : NO_HELD_RECORDINGS;
  return { recordings, loading };
}
