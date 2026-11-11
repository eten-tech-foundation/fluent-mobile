import NetInfo from '@react-native-community/netinfo';
import { getApiBaseUrl } from '../config/apiBaseUrl';
import { logger } from '../utils/logger';

export const SERVER_REACHABILITY_TIMEOUT_MS = 5_000;

const log = logger.create('Connectivity');

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
      credentials: 'omit',
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
  isInternetReachable?: boolean | null;
  details?: unknown;
};

async function resolveConnectivityState(
  state: NetInfoLinkState,
): Promise<ServerReachabilitySnapshot> {
  const isOnline = await resolveServerOnline(state.isConnected);
  return snapshotFromLinkState(state, isOnline);
}

/**
 * How old a `/health` result may be and still be reused by callers that opt
 * in (`maxAgeMs`). `/health` is unauthenticated, so this only caches
 * reachability, never authorization. Short enough that a server that went
 * away is noticed within seconds; long enough to cover the probes a warm
 * light refresh used to issue back to back (#886).
 */
export const SERVER_REACHABILITY_FRESH_MS = 5_000;

let reachabilityInFlight: Promise<ServerReachabilitySnapshot> | null = null;
let lastReachability: {
  snapshot: ServerReachabilitySnapshot;
  at: number;
} | null = null;
/** Bumped on every link event; a probe older than the current value is stale. */
let reachabilityGeneration = 0;

/**
 * Any NetInfo link event makes a cached `/health` result untrustworthy, and
 * a probe that is still running was started on the old link — later callers
 * must not join it and its result must not be cached.
 */
function invalidateReachabilityCache(): void {
  reachabilityGeneration += 1;
  lastReachability = null;
  reachabilityInFlight = null;
}

/** Test-only: forget the shared `/health` result, any in-flight probe and the link observer. */
export function __resetReachabilityCacheForTests(): void {
  invalidateReachabilityCache();
  stopLinkObserver();
  reachabilitySubscribers.clear();
  transportSubscribers.clear();
  retryDelay = defaultDelay;
}

/**
 * Fluent reachability (`/health`) plus NetInfo type.
 *
 * Concurrent callers always share one in-flight probe. A caller that passes
 * `maxAgeMs > 0` also accepts the last completed result when it is younger
 * than that and no link event has happened since; the default (`0`) keeps
 * the previous "probe now" semantics for callers that need a fresh answer.
 */
export async function getConnectivitySnapshot(options?: {
  maxAgeMs?: number;
}): Promise<ServerReachabilitySnapshot> {
  ensureNetInfoConfigured();
  const maxAgeMs = options?.maxAgeMs ?? 0;
  const cacheAgeMs = lastReachability ? Date.now() - lastReachability.at : null;
  if (
    maxAgeMs > 0 &&
    lastReachability &&
    cacheAgeMs !== null &&
    cacheAgeMs >= 0 &&
    cacheAgeMs < maxAgeMs
  ) {
    return lastReachability.snapshot;
  }
  if (reachabilityInFlight) {
    return reachabilityInFlight;
  }
  const generation = reachabilityGeneration;
  const probe = (async () => {
    const snapshot = await resolveConnectivityState(await NetInfo.fetch());
    if (generation === reachabilityGeneration) {
      lastReachability = { snapshot, at: Date.now() };
    }
    return snapshot;
  })();
  const settle = () => {
    if (reachabilityInFlight === probe) {
      reachabilityInFlight = null;
    }
  };
  probe.then(settle, settle);
  reachabilityInFlight = probe;
  return probe;
}

/**
 * The last completed `/health` result if it succeeded within
 * `SERVER_REACHABILITY_FRESH_MS` on the current link; otherwise null. Never
 * probes, and never returns a failure (a failed or 5xx check must be redone).
 */
export function getRecentOnlineReachability(): ServerReachabilitySnapshot | null {
  if (!lastReachability?.snapshot.isOnline) {
    return null;
  }
  const ageMs = Date.now() - lastReachability.at;
  return ageMs >= 0 && ageMs < SERVER_REACHABILITY_FRESH_MS
    ? lastReachability.snapshot
    : null;
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
  /** Test seam for the retry backoff. Shared by every subscriber. */
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

type ReachabilitySubscriber = {
  onChange: (
    isOnline: boolean,
    isWifi: boolean,
    isCellular: boolean,
    connectionType: string,
  ) => void;
  lastEmittedKey: string | null;
};

const reachabilitySubscribers = new Set<ReachabilitySubscriber>();
const transportSubscribers = new Set<
  (snapshot: TransferTransportSnapshot) => void
>();
let retryDelay: (ms: number) => Promise<void> = defaultDelay;

let observing = false;
let unsubscribeNetInfo: (() => void) | null = null;
let linkState: NetInfoLinkState | null = null;
let linkKey: string | null = null;
/** Last shared `/health` result for the current link, broadcast to subscribers. */
let observed: { snapshot: ServerReachabilitySnapshot; at: number } | null =
  null;
/** Bumped by link changes and observer stop; an older evaluation is stale. */
let evaluation = 0;
let evaluating = false;

function detailField(details: unknown, field: string): unknown {
  return details && typeof details === 'object'
    ? (details as Record<string, unknown>)[field]
    : undefined;
}

/**
 * `addEventListener` delivers the latest state to each new listener, and
 * native capability updates (signal strength etc.) re-deliver unchanged link
 * state. Only a change in this key is a link event.
 */
function linkStateKey(state: NetInfoLinkState): string {
  return JSON.stringify([
    state.isConnected,
    state.type,
    state.isInternetReachable ?? null,
    detailField(state.details, 'ipAddress') ?? null,
    detailField(state.details, 'ssid') ?? null,
    detailField(state.details, 'bssid') ?? null,
    detailField(state.details, 'cellularGeneration') ?? null,
  ]);
}

function emitTo(
  subscriber: ReachabilitySubscriber,
  snapshot: ServerReachabilitySnapshot,
): void {
  const key = `${snapshot.isOnline}:${snapshot.isWifi}:${snapshot.isCellular}:${snapshot.connectionType}`;
  if (key === subscriber.lastEmittedKey) {
    return;
  }
  subscriber.lastEmittedKey = key;
  try {
    subscriber.onChange(
      snapshot.isOnline,
      snapshot.isWifi,
      snapshot.isCellular,
      snapshot.connectionType,
    );
  } catch (error) {
    log.warn('Connectivity subscriber threw', { error: String(error) });
  }
}

function emitTransport(
  listener: (snapshot: TransferTransportSnapshot) => void,
  state: NetInfoLinkState,
): void {
  try {
    listener(transferTransportFromNetInfoState(state));
  } catch (error) {
    log.warn('Transport subscriber threw', { error: String(error) });
  }
}

function publish(snapshot: ServerReachabilitySnapshot): void {
  observed = { snapshot, at: Date.now() };
  for (const subscriber of [...reachabilitySubscribers]) {
    if (reachabilitySubscribers.has(subscriber)) {
      emitTo(subscriber, snapshot);
    }
  }
}

/**
 * One `/health` evaluation for all subscribers, retried with backoff while
 * the link is up but Fluent is unreachable. A link change or the last
 * unsubscribe makes it stale; its results are then dropped.
 */
async function evaluateShared(): Promise<void> {
  const gen = ++evaluation;
  const state = linkState;
  if (!state) {
    return;
  }
  if (!state.isConnected) {
    // NetInfo may first report `unknown` before it knows the link; that is not
    // offline. Its next event re-evaluates.
    if (state.isConnected === null || state.type === 'unknown') {
      return;
    }
    publish(snapshotFromLinkState(state, false));
    return;
  }
  evaluating = true;
  try {
    let attempt = 0;
    while (gen === evaluation && reachabilitySubscribers.size > 0) {
      let isOnline: boolean;
      try {
        isOnline = (await getConnectivitySnapshot()).isOnline;
      } catch {
        isOnline = false;
      }
      if (gen !== evaluation) {
        return;
      }
      publish(snapshotFromLinkState(state, isOnline));
      if (isOnline) {
        return;
      }
      const waitMs =
        REACHABILITY_RETRY_BACKOFF_MS[
          Math.min(attempt, REACHABILITY_RETRY_BACKOFF_MS.length - 1)
        ];
      attempt += 1;
      await retryDelay(waitMs);
    }
  } finally {
    if (gen === evaluation) {
      evaluating = false;
    }
  }
}

function onLinkState(state: NetInfoLinkState): void {
  if (!observing) {
    return;
  }
  const key = linkStateKey(state);
  if (key === linkKey) {
    return;
  }
  const linkChanged = linkKey !== null;
  linkKey = key;
  linkState = state;
  if (linkChanged) {
    invalidateReachabilityCache();
  }
  observed = null;
  evaluating = false;
  evaluation += 1;
  for (const listener of [...transportSubscribers]) {
    if (transportSubscribers.has(listener)) {
      emitTransport(listener, state);
    }
  }
  if (reachabilitySubscribers.size > 0) {
    void evaluateShared();
  }
}

function startLinkObserver(): void {
  if (observing) {
    return;
  }
  ensureNetInfoConfigured();
  // Results from before observation started may predate a link change. A
  // probe started after this point is on the link the first state reports.
  invalidateReachabilityCache();
  // NetInfo may call the handler synchronously from addEventListener.
  observing = true;
  const unsubscribe = NetInfo.addEventListener(onLinkState);
  if (!observing) {
    // The last subscriber left during that synchronous delivery.
    unsubscribe();
    return;
  }
  unsubscribeNetInfo = unsubscribe;
  void NetInfo.fetch().then(onLinkState, () => undefined);
}

function stopLinkObserver(): void {
  observing = false;
  unsubscribeNetInfo?.();
  unsubscribeNetInfo = null;
  linkState = null;
  linkKey = null;
  observed = null;
  evaluating = false;
  evaluation += 1;
}

function stopLinkObserverIfIdle(): void {
  if (reachabilitySubscribers.size > 0) {
    return;
  }
  retryDelay = defaultDelay;
  if (transportSubscribers.size === 0) {
    stopLinkObserver();
  } else {
    // Ends a running retry loop; transport subscribers keep the listener.
    evaluation += 1;
    evaluating = false;
    observed = null;
  }
}

/**
 * Fluent reachability for long-lived listeners. All subscribers share one
 * NetInfo listener and one `/health` evaluation; a new subscriber gets the
 * last shared result and re-probes only once it is older than
 * `SERVER_REACHABILITY_FRESH_MS`.
 */
export function subscribeToConnectivity(
  onChange: ReachabilitySubscriber['onChange'],
  options?: SubscribeToConnectivityOptions,
): () => void {
  if (options?.delay) {
    retryDelay = options.delay;
  }
  const subscriber: ReachabilitySubscriber = { onChange, lastEmittedKey: null };
  reachabilitySubscribers.add(subscriber);
  if (!observing) {
    startLinkObserver();
  } else if (linkState) {
    const current = observed;
    const ageMs = current ? Date.now() - current.at : null;
    const fresh =
      ageMs !== null && ageMs >= 0 && ageMs < SERVER_REACHABILITY_FRESH_MS;
    if (current && (fresh || evaluating)) {
      // A running evaluation (first probe or retry backoff) publishes again
      // when it learns more. Read `observed` when the microtask runs: a newer
      // publish or link change may have landed first.
      void Promise.resolve().then(() => {
        const latest = observed?.snapshot;
        if (latest && reachabilitySubscribers.has(subscriber)) {
          emitTo(subscriber, latest);
        }
      });
    } else if (!evaluating) {
      void evaluateShared();
    }
  }

  return () => {
    if (reachabilitySubscribers.delete(subscriber)) {
      stopLinkObserverIfIdle();
    }
  };
}

export function subscribeToTransferTransport(
  onChange: (snapshot: TransferTransportSnapshot) => void,
): () => void {
  let subscribed = true;
  const listener = (snapshot: TransferTransportSnapshot) => {
    if (subscribed) {
      onChange(snapshot);
    }
  };
  transportSubscribers.add(listener);
  if (!observing) {
    startLinkObserver();
  } else if (linkState) {
    void Promise.resolve().then(() => {
      if (linkState) {
        emitTransport(listener, linkState);
      }
    });
  }

  return () => {
    subscribed = false;
    if (transportSubscribers.delete(listener)) {
      stopLinkObserverIfIdle();
    }
  };
}
