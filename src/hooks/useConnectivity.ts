import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getConnectivitySnapshot,
  subscribeToConnectivity,
} from '../services/connectivity';

export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(true);
  const [isWifi, setIsWifi] = useState(true);

  const updateConnectivity = useCallback(
    ({
      isOnline: online,
      isWifi: wifi,
    }: {
      isOnline: boolean;
      isWifi: boolean;
    }) => {
      setIsOnline(online);
      setIsWifi(wifi);
    },
    [],
  );

  useEffect(
    () =>
      subscribeToConnectivity((online, wifi) => {
        updateConnectivity({ isOnline: online, isWifi: wifi });
      }),
    [updateConnectivity],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      void getConnectivitySnapshot().then(snapshot => {
        if (!cancelled) {
          updateConnectivity(snapshot);
        }
      });

      return () => {
        cancelled = true;
      };
    }, [updateConnectivity]),
  );

  return { isOnline, isWifi };
}
