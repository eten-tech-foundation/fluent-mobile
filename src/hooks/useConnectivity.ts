import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getConnectivitySnapshot,
  subscribeToConnectivity,
} from '../services/connectivity';

export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(true);
  const [isWifi, setIsWifi] = useState(true);
  const [isCellular, setIsCellular] = useState(false);
  const [hasResolved, setHasResolved] = useState(false);

  const updateConnectivity = useCallback(
    ({
      isOnline: online,
      isWifi: wifi,
      isCellular: cellular,
    }: {
      isOnline: boolean;
      isWifi: boolean;
      isCellular: boolean;
    }) => {
      setIsOnline(online);
      setIsWifi(wifi);
      setIsCellular(cellular);
      setHasResolved(true);
    },
    [],
  );

  useEffect(
    () =>
      subscribeToConnectivity((online, wifi, cellular) => {
        updateConnectivity({
          isOnline: online,
          isWifi: wifi,
          isCellular: cellular,
        });
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

  return { isOnline, isWifi, isCellular, hasResolved };
}
