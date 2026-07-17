import { useAsyncRequestGuard } from './useAsyncRequestGuard';
import { useCallback, useEffect, useState } from 'react';
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
  const { startRequest, isStale } = useAsyncRequestGuard();

  const refresh = useCallback(async () => {
    const requestId = startRequest();
    const activeUserId = getActiveUserId();
    const knownUserIds = getKnownUserIds();

    if (!activeUserId) {
      if (isStale(requestId)) return;
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

    if (isStale(requestId)) return;

    setSummary({
      activeUserId,
      email: dbUser?.email ?? getUserEmail(activeUserId),
      firstName: dbUser?.firstName,
      lastName: dbUser?.lastName,
      accountCount: knownUserIds.length,
    });
  }, [startRequest, isStale]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  return {
    ...summary,
    refresh,
    hasMultipleAccounts: summary.accountCount >= 2,
  };
}
