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

async function resolveConnectivityState(state: {
  isConnected: boolean | null;
  type: string;
}): Promise<{ isOnline: boolean; isWifi: boolean; isCellular: boolean }> {
  const isOnline = await resolveServerOnline(state.isConnected);
  return {
    isOnline,
    isWifi: state.type === 'wifi',
    isCellular: state.type === 'cellular',
  };
}

export async function getConnectivitySnapshot(): Promise<{
  isOnline: boolean;
  isWifi: boolean;
  isCellular: boolean;
}> {
  ensureNetInfoConfigured();
  return resolveConnectivityState(await NetInfo.fetch());
}

export function subscribeToConnectivity(
  onChange: (isOnline: boolean, isWifi: boolean, isCellular: boolean) => void,
): () => void {
  ensureNetInfoConfigured();

  let cancelled = false;

  const evaluate = async (state: {
    isConnected: boolean | null;
    type: string;
  }) => {
    const { isOnline, isWifi, isCellular } = await resolveConnectivityState(
      state,
    );
    if (!cancelled) {
      onChange(isOnline, isWifi, isCellular);
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
