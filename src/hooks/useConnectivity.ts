import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  getConnectivitySnapshot,
  getTransferTransportSnapshot,
  subscribeToConnectivity,
  subscribeToTransferTransport,
  type TransferTransportSnapshot,
} from '../services/connectivity';

export type UseConnectivityResult = {
  /** Fluent `/health` reachability. */
  isOnline: boolean;
  /** NetInfo `isConnected === true` (no `/health`). */
  isLinkOnline: boolean;
  isWifi: boolean;
  isCellular: boolean;
  connectionType: string;
  hasResolved: boolean;
  hasTransferResolved: boolean;
  connectivityPending: boolean;
  transferConnectivityPending: boolean;
};

export function useConnectivity(): UseConnectivityResult {
  const [isOnline, setIsOnline] = useState(true);
  const [isLinkOnline, setIsLinkOnline] = useState(false);
  const [isWifi, setIsWifi] = useState(true);
  const [isCellular, setIsCellular] = useState(false);
  const [connectionType, setConnectionType] = useState('wifi');
  const [hasResolved, setHasResolved] = useState(false);
  const [hasTransferResolved, setHasTransferResolved] = useState(false);

  const connectivityPending = !hasResolved;
  const transferConnectivityPending = !hasTransferResolved;

  const applyReachability = useCallback((online: boolean) => {
    setIsOnline(online);
    setHasResolved(true);
  }, []);

  const applyTransfer = useCallback((snapshot: TransferTransportSnapshot) => {
    setIsLinkOnline(snapshot.isLinkOnline);
    setIsWifi(snapshot.isWifi);
    setIsCellular(snapshot.isCellular);
    setConnectionType(snapshot.connectionType);
    setHasTransferResolved(true);
  }, []);

  useEffect(
    () =>
      subscribeToConnectivity(online => {
        applyReachability(online);
      }),
    [applyReachability],
  );

  useEffect(() => subscribeToTransferTransport(applyTransfer), [applyTransfer]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      void getConnectivitySnapshot().then(snapshot => {
        if (!cancelled) {
          applyReachability(snapshot.isOnline);
        }
      });

      void getTransferTransportSnapshot().then(snapshot => {
        if (!cancelled) {
          applyTransfer(snapshot);
        }
      });

      return () => {
        cancelled = true;
      };
    }, [applyReachability, applyTransfer]),
  );

  return {
    isOnline,
    isLinkOnline,
    isWifi,
    isCellular,
    connectionType,
    hasResolved,
    hasTransferResolved,
    connectivityPending,
    transferConnectivityPending,
  };
}
