import { useCallback, useEffect, useRef, useState } from 'react';
import { getUserById } from '../db/queries';
import {
  getActiveUserId,
  getKnownUserIds,
  getUserEmail,
} from '../services/storage';

export interface ActiveAccountSummary {
  activeUserId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  accountCount: number;
}

function emptySummary(): ActiveAccountSummary {
  return {
    activeUserId: '',
    email: '',
    accountCount: 0,
  };
}

export function useActiveAccountSummary(refreshKey = 0) {
  const [summary, setSummary] = useState<ActiveAccountSummary>(() =>
    emptySummary(),
  );
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const activeUserId = getActiveUserId();
    const knownUserIds = getKnownUserIds();

    if (!activeUserId) {
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }
      setSummary({
        ...emptySummary(),
        accountCount: knownUserIds.length,
      });
      return;
    }

    const parsedUserId = Number(activeUserId);
    const dbUser = Number.isFinite(parsedUserId)
      ? await getUserById(parsedUserId)
      : null;

    if (!mountedRef.current || requestId !== requestIdRef.current) {
      return;
    }

    setSummary({
      activeUserId,
      email: dbUser?.email ?? getUserEmail(activeUserId),
      firstName: dbUser?.firstName,
      lastName: dbUser?.lastName,
      accountCount: knownUserIds.length,
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  return {
    ...summary,
    refresh,
    hasMultipleAccounts: summary.accountCount >= 2,
  };
}
