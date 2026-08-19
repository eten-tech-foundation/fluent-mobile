import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { isReauthRequiredForActiveUser } from '../services/storage';
import {
  onAuthReauthRequired,
  onAuthReauthResolved,
} from '../services/syncEvents';

export function useReauthRequired(options?: { refreshOnFocus?: boolean }) {
  const [reauthRequired, setReauthRequired] = useState(
    isReauthRequiredForActiveUser,
  );

  const refreshReauthRequired = useCallback(() => {
    setReauthRequired(isReauthRequiredForActiveUser());
  }, []);

  useEffect(() => {
    refreshReauthRequired();
    const unsubRequired = onAuthReauthRequired(() => refreshReauthRequired());
    const unsubResolved = onAuthReauthResolved(() => refreshReauthRequired());
    return () => {
      unsubRequired();
      unsubResolved();
    };
  }, [refreshReauthRequired]);

  useFocusEffect(
    useCallback(() => {
      if (options?.refreshOnFocus) {
        refreshReauthRequired();
      }
    }, [options?.refreshOnFocus, refreshReauthRequired]),
  );

  return { reauthRequired, refreshReauthRequired };
}
