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

export function subscribeToConnectivity(
  onChange: (isOnline: boolean) => void,
): () => void {
  ensureNetInfoConfigured();

  let cancelled = false;

  const evaluate = async (isConnected: boolean | null) => {
    const isOnline = await resolveServerOnline(isConnected);
    if (!cancelled) {
      onChange(isOnline);
    }
  };

  const unsubscribe = NetInfo.addEventListener(state => {
    void evaluate(state.isConnected);
  });

  void NetInfo.fetch().then(state => evaluate(state.isConnected));

  return () => {
    cancelled = true;
    unsubscribe();
  };
}
