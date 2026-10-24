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

type HealthTraceResult =
  | 'success'
  | 'http_error'
  | 'AbortError'
  | 'networkError'
  | 'link_disconnected';

// Temporary QA717 diagnostic. All fields are primitives from this allowlist;
// tracing must never affect health results or expose URLs/errors/responses.
function traceHealthProbe(
  startedAt: number,
  result: HealthTraceResult,
  state?: NetInfoLinkState,
  response?: { status?: number },
  error?: unknown,
): void {
  if (!__DEV__) return;
  try {
    const status = response?.status;
    const connectionType = state?.type;
    const allowedTypes = [
      'none',
      'unknown',
      'wifi',
      'cellular',
      'ethernet',
      'bluetooth',
      'wimax',
      'vpn',
      'other',
    ];
    // eslint-disable-next-line no-console -- DEV-only info avoids a diagnostic LogBox overlay.
    console.info('[FLUENT_QA717_HEALTH_V1]', {
      host: new URL(getApiBaseUrl()).hostname,
      isConnected:
        typeof state?.isConnected === 'boolean' ? state.isConnected : null,
      connectionType: allowedTypes.includes(connectionType ?? '')
        ? connectionType
        : 'unknown',
      result:
        result === 'networkError' &&
        error instanceof Error &&
        error.name === 'AbortError'
          ? 'AbortError'
          : result,
      httpStatus:
        Number.isInteger(status) &&
        Number(status) >= 100 &&
        Number(status) <= 599
          ? status
          : null,
      elapsedMs: Math.max(0, Date.now() - startedAt),
    });
  } catch {
    // A diagnostic failure must preserve the original request behavior.
  }
}

export async function checkServerReachable(
  state?: NetInfoLinkState,
): Promise<boolean> {
  const startedAt = Date.now();
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
    traceHealthProbe(startedAt, res.ok ? 'success' : 'http_error', state, res);
    return res.ok;
  } catch (error) {
    traceHealthProbe(
      startedAt,
      controller.signal.aborted ? 'AbortError' : 'networkError',
      state,
      undefined,
      error,
    );
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveServerOnline(
  isConnected: boolean | null,
  connectionType = 'unknown',
): Promise<boolean> {
  const state = { isConnected, type: connectionType };
  if (!isConnected) {
    traceHealthProbe(Date.now(), 'link_disconnected', state);
    return false;
  }

  return checkServerReachable(state);
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
  const isOnline = await resolveServerOnline(state.isConnected, state.type);
  return snapshotFromLinkState(state, isOnline);
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

export type SubscribeToConnectivityOptions = {
  delay?: (ms: number) => Promise<void>;
};

const REACHABILITY_RETRY_BACKOFF_MS = [250, 500, 1_000, 2_000, 4_000];

function defaultDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function snapshotFromLinkState(
  state: NetInfoLinkState,
  isOnline: boolean,
): ServerReachabilitySnapshot {
  return {
    isOnline,
    isWifi: state.type === 'wifi',
    isCellular: state.type === 'cellular',
    connectionType: state.type,
  };
}

export function subscribeToConnectivity(
  onChange: (
    isOnline: boolean,
    isWifi: boolean,
    isCellular: boolean,
    connectionType: string,
  ) => void,
  options?: SubscribeToConnectivityOptions,
): () => void {
  ensureNetInfoConfigured();

  const delay = options?.delay ?? defaultDelay;
  let cancelled = false;
  let generation = 0;
  let lastEmittedKey: string | null = null;

  const emit = (snapshot: ServerReachabilitySnapshot, gen: number) => {
    if (cancelled || gen !== generation) {
      return;
    }
    const key = `${snapshot.isOnline}:${snapshot.isWifi}:${snapshot.isCellular}:${snapshot.connectionType}`;
    if (key === lastEmittedKey) {
      return;
    }
    lastEmittedKey = key;
    onChange(
      snapshot.isOnline,
      snapshot.isWifi,
      snapshot.isCellular,
      snapshot.connectionType,
    );
  };

  const evaluate = async (state: NetInfoLinkState) => {
    const gen = ++generation;
    if (!state.isConnected) {
      traceHealthProbe(Date.now(), 'link_disconnected', state);
      emit(snapshotFromLinkState(state, false), gen);
      return;
    }

    let attempt = 0;
    while (!cancelled && gen === generation) {
      const snapshot = await resolveConnectivityState(state);
      emit(snapshot, gen);
      if (cancelled || gen !== generation || snapshot.isOnline) {
        return;
      }
      const waitMs =
        REACHABILITY_RETRY_BACKOFF_MS[
          Math.min(attempt, REACHABILITY_RETRY_BACKOFF_MS.length - 1)
        ];
      attempt += 1;
      await delay(waitMs);
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
