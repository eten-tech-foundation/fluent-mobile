import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  getConnectivitySnapshot,
  subscribeToConnectivity,
} from '../services/connectivity';
import { transportQaLog } from '../utils/transportQaLog';

export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(true);
  const [isWifi, setIsWifi] = useState(true);
  const [isCellular, setIsCellular] = useState(false);
  const [connectionType, setConnectionType] = useState('wifi');
  const [hasResolved, setHasResolved] = useState(false);

  const connectivityPending = !hasResolved;

  const updateConnectivity = useCallback(
    ({
      isOnline: online,
      isWifi: wifi,
      isCellular: cellular,
      connectionType: type,
    }: {
      isOnline: boolean;
      isWifi: boolean;
      isCellular: boolean;
      connectionType: string;
    }) => {
      setIsOnline(online);
      setIsWifi(wifi);
      setIsCellular(cellular);
      setConnectionType(type);
      setHasResolved(true);
      transportQaLog(
        'REDE',
        online
          ? `Conectividade atualizada — tipo "${type}", Wi-Fi=${
              wifi ? 'sim' : 'não'
            }, cellular=${cellular ? 'sim' : 'não'}`
          : `Sem conectividade de rede (tipo "${type}")`,
      );
    },
    [],
  );

  useEffect(
    () =>
      subscribeToConnectivity((online, wifi, cellular, type) => {
        updateConnectivity({
          isOnline: online,
          isWifi: wifi,
          isCellular: cellular,
          connectionType: type,
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

  return {
    isOnline,
    isWifi,
    isCellular,
    connectionType,
    hasResolved,
    connectivityPending,
  };
}
