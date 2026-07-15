import { useCallback, useEffect, useRef, useState } from 'react';
import { getUserById } from '../db/queries';
import {
  getAccountDisplayName,
  getAccountInitials,
} from '../utils/accountDisplay';
import {
  getActiveUserId,
  getKnownUserIds,
  getUserEmail,
} from '../services/storage';

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
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const activeUserId = getActiveUserId();
    const knownUserIds = getKnownUserIds();

    if (!mountedRef.current) return;
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

      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      setAccounts(loadedAccounts);
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    void reload();
  }, [visible, reload]);

  return {
    accounts,
    accountCount: accounts.length,
    activeUserId: getActiveUserId(),
    hasAccountLimit: accounts.length >= 3,
    loading,
    reload,
  };
}
