import { useCallback, useState, useEffect } from 'react';
import { getUserById } from '../db/queries';
import {
  getAccountDisplayName,
  getAccountInitials,
} from '../utils/accountDisplay';
import {
  getActiveUserId,
  getKnownUserIds,
  getUserEmail,
  MAX_DEVICE_ACCOUNTS,
} from '../services/storage';
import { logger } from '../utils/logger';
import { useAsyncRequestGuard } from './useAsyncRequestGuard';

const log = logger.create('useDeviceAccounts');

export interface DeviceAccount {
  userId: string;
  displayName: string;
  email: string;
  initials: string;
  isActive: boolean;
}

interface UseDeviceAccountsResult {
  accounts: DeviceAccount[];
  accountCount: number;
  activeUserId: string;
  hasAccountLimit: boolean;
  loading: boolean;
  reload: () => Promise<void>;
}

export function useDeviceAccounts(visible: boolean): UseDeviceAccountsResult {
  const [accounts, setAccounts] = useState<DeviceAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const { startRequest, isStale } = useAsyncRequestGuard();

  const reload = useCallback(async () => {
    const requestId = startRequest();
    const activeUserId = getActiveUserId();
    const knownUserIds = getKnownUserIds();

    if (isStale(requestId)) return;
    setLoading(true);

    try {
      const loadedAccounts = await Promise.all(
        knownUserIds.map(async userId => {
          const parsedUserId = Number(userId);
          const dbUser = Number.isFinite(parsedUserId)
            ? await getUserById(parsedUserId)
            : null;
          const email = dbUser?.email ?? getUserEmail(userId);
          const displayName = getAccountDisplayName({
            firstName: dbUser?.firstName,
            lastName: dbUser?.lastName,
            email,
          });

          return {
            userId,
            displayName,
            email,
            initials: getAccountInitials({
              firstName: dbUser?.firstName,
              lastName: dbUser?.lastName,
              email,
            }),
            isActive: userId === activeUserId,
          };
        }),
      );

      if (isStale(requestId)) return;

      setAccounts(loadedAccounts);
    } catch (error) {
      log.error('Failed to load device accounts', { error });
    } finally {
      if (!isStale(requestId)) {
        setLoading(false);
      }
    }
  }, [startRequest, isStale]);

  useEffect(() => {
    if (!visible) return;
    void reload();
  }, [visible, reload]);

  return {
    accounts,
    accountCount: accounts.length,
    activeUserId: getActiveUserId(),
    hasAccountLimit: accounts.length >= MAX_DEVICE_ACCOUNTS,
    loading,
    reload,
  };
}
