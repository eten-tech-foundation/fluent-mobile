import { useEffect, useState } from 'react';
import { anyDeviceAccountNeedsSignIn } from '../services/accountSession';
import { onUploadSessionEvent } from '../services/syncEvents';
import { logger } from '../utils/logger';

const log = logger.create('useOtherAccountNeedsSignIn');

/**
 * Whether another account with queued uploads on this device must sign in
 * before that work can upload (#854). Re-checks when the set of accounts or
 * `refreshKey` changes (sync complete, user switch), and when an upload
 * session ends, since that is when another account's token gets rejected.
 */
export function useOtherAccountNeedsSignIn(
  ownerIds: readonly number[],
  refreshKey = 0,
): boolean {
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [sessionsEnded, setSessionsEnded] = useState(0);
  const key = ownerIds.join(',');

  useEffect(
    () =>
      onUploadSessionEvent(event => {
        if (
          event.type === 'complete' ||
          event.type === 'idle' ||
          event.type === 'cancelled'
        ) {
          setSessionsEnded(count => count + 1);
        }
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const ids = key === '' ? [] : key.split(',').map(Number);
    if (ids.length === 0) {
      setNeedsSignIn(false);
      return;
    }
    anyDeviceAccountNeedsSignIn(ids)
      .then(result => {
        if (!cancelled) setNeedsSignIn(result);
      })
      .catch(error => {
        log.warn('Could not check other accounts for sign-in', { error });
      });
    return () => {
      cancelled = true;
    };
  }, [key, refreshKey, sessionsEnded]);

  return needsSignIn;
}
