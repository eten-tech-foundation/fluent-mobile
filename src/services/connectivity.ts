import NetInfo from '@react-native-community/netinfo';
import { getApiBaseUrl } from '../config/apiBaseUrl';

export const SERVER_REACHABILITY_TIMEOUT_MS = 5_000;

const getReachabilityUrl = () => `${getApiBaseUrl()}/health`;

let configured = false;

function ensureNetInfoConfigured() {
  if (configured) {
    return;
  }

  NetInfo.configure({
    reachabilityUrl: getReachabilityUrl(),
    reachabilityMethod: 'GET',
    reachabilityLongTimeout: 60_000,
    reachabilityShortTimeout: SERVER_REACHABILITY_TIMEOUT_MS,
  });

  configured = true;
}

export async function checkServerReachable(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    SERVER_REACHABILITY_TIMEOUT_MS,
  );

  try {
    const res = await fetch(getReachabilityUrl(), {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveServerOnline(
  isConnected: boolean | null,
): Promise<boolean> {
  if (!isConnected) {
    return false;
  }

  return checkServerReachable();
}

/** Fluent `/health` reachability plus NetInfo type. `isOnline` is not link-layer. */
export type ServerReachabilitySnapshot = {
  isOnline: boolean;
  isWifi: boolean;
  isCellular: boolean;
  connectionType: string;
};

/** @deprecated Use ServerReachabilitySnapshot — `isOnline` means `/health`. */
export type ConnectivitySnapshot = ServerReachabilitySnapshot;

/** NetInfo link-layer only. `isLinkOnline` is `isConnected === true` (no `/health`). */
export type TransferTransportSnapshot = {
  isLinkOnline: boolean;
  isWifi: boolean;
  isCellular: boolean;
  connectionType: string;
};

type NetInfoLinkState = {
  isConnected: boolean | null;
  type: string;
};

async function resolveConnectivityState(
  state: NetInfoLinkState,
): Promise<ServerReachabilitySnapshot> {
  const isOnline = await resolveServerOnline(state.isConnected);
  return {
    isOnline,
    isWifi: state.type === 'wifi',
    isCellular: state.type === 'cellular',
    connectionType: state.type,
  };
}

export async function getConnectivitySnapshot(): Promise<ServerReachabilitySnapshot> {
  ensureNetInfoConfigured();
  return resolveConnectivityState(await NetInfo.fetch());
}

/** Link-layer snapshot for transport gating (no `/health` reachability). */
export function transferTransportFromNetInfoState(
  state: NetInfoLinkState,
): TransferTransportSnapshot {
  return {
    isLinkOnline: state.isConnected === true,
    isWifi: state.type === 'wifi',
    isCellular: state.type === 'cellular',
    connectionType: state.type,
  };
}

export async function getTransferTransportSnapshot(): Promise<TransferTransportSnapshot> {
  ensureNetInfoConfigured();
  return transferTransportFromNetInfoState(await NetInfo.fetch());
}

export function subscribeToConnectivity(
  onChange: (
    isOnline: boolean,
    isWifi: boolean,
    isCellular: boolean,
    connectionType: string,
  ) => void,
): () => void {
  ensureNetInfoConfigured();

  let cancelled = false;

  const evaluate = async (state: NetInfoLinkState) => {
    const { isOnline, isWifi, isCellular, connectionType } =
      await resolveConnectivityState(state);
    if (!cancelled) {
      onChange(isOnline, isWifi, isCellular, connectionType);
    }
  };

  const unsubscribe = NetInfo.addEventListener(state => {
    void evaluate(state);
  });

  void NetInfo.fetch().then(evaluate);

  return () => {
    cancelled = true;
    unsubscribe();
  };
}

export function subscribeToTransferTransport(
  onChange: (snapshot: TransferTransportSnapshot) => void,
): () => void {
  ensureNetInfoConfigured();

  let cancelled = false;

  const emit = (state: NetInfoLinkState) => {
    if (!cancelled) {
      onChange(transferTransportFromNetInfoState(state));
    }
  };

  const unsubscribe = NetInfo.addEventListener(state => {
    emit(state);
  });

  void NetInfo.fetch().then(state => {
    emit(state);
  });

  return () => {
    cancelled = true;
    unsubscribe();
  };
}
