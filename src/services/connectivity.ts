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

export type ConnectivitySnapshot = {
  isOnline: boolean;
  isWifi: boolean;
  isCellular: boolean;
  connectionType: string;
};

async function resolveConnectivityState(state: {
  isConnected: boolean | null;
  type: string;
}): Promise<ConnectivitySnapshot> {
  const isOnline = await resolveServerOnline(state.isConnected);
  return {
    isOnline,
    isWifi: state.type === 'wifi',
    isCellular: state.type === 'cellular',
    connectionType: state.type,
  };
}

export async function getConnectivitySnapshot(): Promise<ConnectivitySnapshot> {
  ensureNetInfoConfigured();
  return resolveConnectivityState(await NetInfo.fetch());
}

/** Link-layer snapshot for transport gating (no `/health` reachability). */
export function transferTransportFromNetInfoState(state: {
  isConnected: boolean | null;
  type: string;
}): ConnectivitySnapshot {
  return {
    isOnline: state.isConnected === true,
    isWifi: state.type === 'wifi',
    isCellular: state.type === 'cellular',
    connectionType: state.type,
  };
}

export async function getTransferTransportSnapshot(): Promise<ConnectivitySnapshot> {
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

  const evaluate = async (state: {
    isConnected: boolean | null;
    type: string;
  }) => {
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
