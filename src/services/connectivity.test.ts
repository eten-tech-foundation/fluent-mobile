import NetInfo from '@react-native-community/netinfo';
import { waitFor } from '@testing-library/react-native';
import {
  __resetReachabilityCacheForTests,
  getConnectivitySnapshot,
  getRecentOnlineReachability,
  getTransferTransportSnapshot,
  SERVER_REACHABILITY_FRESH_MS,
  subscribeToConnectivity,
  subscribeToTransferTransport,
} from './connectivity';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    fetch: jest.fn(),
    addEventListener: jest.fn(),
  },
}));

const mockNetInfo = NetInfo as unknown as {
  configure: jest.Mock;
  fetch: jest.Mock;
  addEventListener: jest.Mock;
};

type ConnectivityState = {
  isConnected: boolean | null;
  type: string;
  isInternetReachable?: boolean | null;
  details?: unknown;
};

const flushAsync = () =>
  new Promise<void>(resolve => {
    setImmediate(resolve);
  });

describe('connectivity', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    __resetReachabilityCacheForTests();
    fetchMock.mockResolvedValue({ ok: true });
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getConnectivitySnapshot reports wifi when NetInfo type is wifi', async () => {
    mockNetInfo.fetch.mockResolvedValue({
      isConnected: true,
      type: 'wifi',
    });

    await expect(getConnectivitySnapshot()).resolves.toEqual({
      isOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });
  });

  describe('shared reachability probe (#886)', () => {
    const online = { isConnected: true, type: 'wifi' };
    const onlineSnapshot = {
      isOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    };

    it('concurrent callers share one in-flight /health probe', async () => {
      mockNetInfo.fetch.mockResolvedValue(online);
      let releaseProbe: ((value: { ok: boolean }) => void) | undefined;
      fetchMock.mockImplementationOnce(
        () =>
          new Promise<{ ok: boolean }>(resolve => {
            releaseProbe = resolve;
          }),
      );

      const first = getConnectivitySnapshot();
      const second = getConnectivitySnapshot();
      const third = getConnectivitySnapshot({ maxAgeMs: 1 });
      await flushAsync();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      releaseProbe?.({ ok: true });
      await expect(Promise.all([first, second, third])).resolves.toEqual([
        onlineSnapshot,
        onlineSnapshot,
        onlineSnapshot,
      ]);
    });

    it('the /health probe bypasses the WebView cookie jar and keeps its abort signal', async () => {
      mockNetInfo.fetch.mockResolvedValue(online);

      await expect(getConnectivitySnapshot()).resolves.toEqual(onlineSnapshot);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(new URL(url).pathname).toBe('/health');
      // Pinned expo/fetch: anything but 'omit' routes through the WebView CookieManager.
      expect(init.credentials).toBe('omit');
      expect(init.method).toBe('GET');
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    });

    it('probes again by default once the previous probe has settled', async () => {
      mockNetInfo.fetch.mockResolvedValue(online);

      await getConnectivitySnapshot();
      await getConnectivitySnapshot();

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('reuses a result younger than maxAgeMs and re-probes once it ages out', async () => {
      mockNetInfo.fetch.mockResolvedValue(online);
      const baseMs = Date.now();
      let clockOffsetMs = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => baseMs + clockOffsetMs);

      await getConnectivitySnapshot();
      clockOffsetMs = SERVER_REACHABILITY_FRESH_MS - 1;
      await expect(
        getConnectivitySnapshot({ maxAgeMs: SERVER_REACHABILITY_FRESH_MS }),
      ).resolves.toEqual(onlineSnapshot);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      clockOffsetMs = SERVER_REACHABILITY_FRESH_MS + 1;
      await getConnectivitySnapshot({
        maxAgeMs: SERVER_REACHABILITY_FRESH_MS,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('re-probes after the wall clock moves backwards', async () => {
      mockNetInfo.fetch.mockResolvedValue(online);
      const realNow = Date.now;
      let offset = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
      await getConnectivitySnapshot();
      offset = -60_000;
      await getConnectivitySnapshot({ maxAgeMs: SERVER_REACHABILITY_FRESH_MS });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not reuse a cached result after a NetInfo link event', async () => {
      const handlers: Array<(state: ConnectivityState) => void> = [];
      mockNetInfo.fetch.mockResolvedValue(online);
      mockNetInfo.addEventListener.mockImplementation(
        (handler: (state: ConnectivityState) => void) => {
          handlers.push(handler);
          return jest.fn();
        },
      );
      const unsubscribe = subscribeToConnectivity(jest.fn());
      await flushAsync();
      fetchMock.mockClear();

      await getConnectivitySnapshot();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      handlers[0]?.({ isConnected: false, type: 'none' });
      mockNetInfo.fetch.mockResolvedValue({ isConnected: false, type: 'none' });

      await expect(
        getConnectivitySnapshot({ maxAgeMs: SERVER_REACHABILITY_FRESH_MS }),
      ).resolves.toMatchObject({ isOnline: false });
      unsubscribe();
    });

    it('a link event during a probe discards that probe: later callers re-probe and its result is not cached', async () => {
      const handlers: Array<(state: ConnectivityState) => void> = [];
      mockNetInfo.fetch.mockResolvedValue(online);
      mockNetInfo.addEventListener.mockImplementation(
        (handler: (state: ConnectivityState) => void) => {
          handlers.push(handler);
          return jest.fn();
        },
      );
      const unsubscribe = subscribeToConnectivity(jest.fn());
      await flushAsync();
      fetchMock.mockClear();

      let releaseStale: ((value: { ok: boolean }) => void) | undefined;
      fetchMock.mockImplementationOnce(
        () =>
          new Promise<{ ok: boolean }>(resolve => {
            releaseStale = resolve;
          }),
      );
      const stale = getConnectivitySnapshot();
      await flushAsync();

      // Link changed while the old probe is still in flight.
      mockNetInfo.fetch.mockResolvedValue({
        isConnected: true,
        type: 'cellular',
      });
      handlers[0]?.({ isConnected: true, type: 'cellular' });

      // A caller arriving after the event must not join the stale probe …
      const fresh = getConnectivitySnapshot({
        maxAgeMs: SERVER_REACHABILITY_FRESH_MS,
      });
      releaseStale?.({ ok: false });
      await expect(stale).resolves.toMatchObject({ isOnline: false });
      await expect(fresh).resolves.toMatchObject({
        isOnline: true,
        connectionType: 'cellular',
      });
      // … and the stale result must not be served from the cache afterwards.
      await expect(
        getConnectivitySnapshot({ maxAgeMs: SERVER_REACHABILITY_FRESH_MS }),
      ).resolves.toMatchObject({ isOnline: true });
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
      unsubscribe();
    });

    it('a transfer-transport link event also invalidates the cached result', async () => {
      const handlers: Array<(state: ConnectivityState) => void> = [];
      mockNetInfo.fetch.mockResolvedValue(online);
      mockNetInfo.addEventListener.mockImplementation(
        (handler: (state: ConnectivityState) => void) => {
          handlers.push(handler);
          return jest.fn();
        },
      );
      const unsubscribe = subscribeToTransferTransport(jest.fn());
      await flushAsync();
      fetchMock.mockClear();

      await getConnectivitySnapshot();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      handlers[0]?.({ isConnected: false, type: 'none' });
      mockNetInfo.fetch.mockResolvedValue({ isConnected: false, type: 'none' });

      await expect(
        getConnectivitySnapshot({ maxAgeMs: SERVER_REACHABILITY_FRESH_MS }),
      ).resolves.toMatchObject({ isOnline: false });
      unsubscribe();
    });

    describe('getRecentOnlineReachability', () => {
      const watchLink = () => {
        const handlers: Array<(state: ConnectivityState) => void> = [];
        mockNetInfo.addEventListener.mockImplementation(
          (handler: (state: ConnectivityState) => void) => {
            handlers.push(handler);
            return jest.fn();
          },
        );
        return handlers;
      };

      it('is null before any probe and never probes', () => {
        expect(getRecentOnlineReachability()).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(mockNetInfo.fetch).not.toHaveBeenCalled();
      });

      it('returns a fresh success, then null once it ages out', async () => {
        mockNetInfo.fetch.mockResolvedValue(online);
        const baseMs = Date.now();
        let clockOffsetMs = 0;
        jest
          .spyOn(Date, 'now')
          .mockImplementation(() => baseMs + clockOffsetMs);

        await getConnectivitySnapshot();
        clockOffsetMs = SERVER_REACHABILITY_FRESH_MS - 1;
        expect(getRecentOnlineReachability()).toEqual(onlineSnapshot);
        clockOffsetMs = SERVER_REACHABILITY_FRESH_MS;
        expect(getRecentOnlineReachability()).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      it('never returns a failed (5xx) or link-down result', async () => {
        mockNetInfo.fetch.mockResolvedValue(online);
        fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
        await getConnectivitySnapshot();
        expect(getRecentOnlineReachability()).toBeNull();

        mockNetInfo.fetch.mockResolvedValue({
          isConnected: false,
          type: 'none',
        });
        await getConnectivitySnapshot();
        expect(getRecentOnlineReachability()).toBeNull();
      });

      it('survives an identical link redelivery but not a real link change', async () => {
        const handlers = watchLink();
        mockNetInfo.fetch.mockResolvedValue(online);
        const unsubscribe = subscribeToConnectivity(jest.fn());
        await waitFor(() => {
          expect(getRecentOnlineReachability()).toEqual(onlineSnapshot);
        });
        fetchMock.mockClear();

        // Capability updates (e.g. signal strength) re-deliver the same link.
        handlers[0]?.({
          ...online,
          details: { strength: 40 },
        });
        await flushAsync();
        expect(getRecentOnlineReachability()).toEqual(onlineSnapshot);
        expect(fetchMock).not.toHaveBeenCalled();

        let release: ((value: { ok: boolean }) => void) | undefined;
        fetchMock.mockImplementationOnce(
          () =>
            new Promise<{ ok: boolean }>(resolve => {
              release = resolve;
            }),
        );
        handlers[0]?.({ ...online, details: { ipAddress: '10.0.0.9' } });
        expect(getRecentOnlineReachability()).toBeNull();
        release?.({ ok: true });
        unsubscribe();
      });

      it('does not return a success from a probe started before a link change', async () => {
        const handlers = watchLink();
        mockNetInfo.fetch.mockResolvedValue(online);
        const unsubscribe = subscribeToConnectivity(jest.fn());
        await flushAsync();
        await flushAsync();

        let releaseStale: ((value: { ok: boolean }) => void) | undefined;
        fetchMock.mockImplementationOnce(
          () =>
            new Promise<{ ok: boolean }>(resolve => {
              releaseStale = resolve;
            }),
        );
        const stale = getConnectivitySnapshot();
        await flushAsync();
        mockNetInfo.fetch.mockReturnValue(new Promise(() => undefined));
        handlers[0]?.({ isConnected: true, type: 'cellular' });
        releaseStale?.({ ok: true });
        await stale;
        expect(getRecentOnlineReachability()).toBeNull();
        unsubscribe();
      });
    });

    it('a cached offline result is also reused only inside maxAgeMs', async () => {
      mockNetInfo.fetch.mockResolvedValue({ isConnected: false, type: 'none' });

      await getConnectivitySnapshot();
      mockNetInfo.fetch.mockResolvedValue(online);

      await expect(
        getConnectivitySnapshot({ maxAgeMs: SERVER_REACHABILITY_FRESH_MS }),
      ).resolves.toMatchObject({ isOnline: false });
      await expect(getConnectivitySnapshot()).resolves.toMatchObject({
        isOnline: true,
      });
    });

    it('a failed probe does not pin later callers to a rejected promise', async () => {
      mockNetInfo.fetch.mockRejectedValueOnce(new Error('netinfo unavailable'));
      await expect(getConnectivitySnapshot()).rejects.toThrow(
        'netinfo unavailable',
      );

      mockNetInfo.fetch.mockResolvedValue(online);
      await expect(getConnectivitySnapshot()).resolves.toEqual(onlineSnapshot);
    });
  });

  it('getTransferTransportSnapshot uses link connectivity without server health', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    mockNetInfo.fetch.mockResolvedValue({
      isConnected: true,
      type: 'wifi',
    });

    await expect(getTransferTransportSnapshot()).resolves.toEqual({
      isLinkOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });
  });

  it('getTransferTransportSnapshot reports ethernet', async () => {
    mockNetInfo.fetch.mockResolvedValue({
      isConnected: true,
      type: 'ethernet',
    });

    await expect(getTransferTransportSnapshot()).resolves.toEqual({
      isLinkOnline: true,
      isWifi: false,
      isCellular: false,
      connectionType: 'ethernet',
    });
  });

  it('getConnectivitySnapshot reports non-wifi cellular as isWifi false', async () => {
    mockNetInfo.fetch.mockResolvedValue({
      isConnected: true,
      type: 'cellular',
    });

    await expect(getConnectivitySnapshot()).resolves.toEqual({
      isOnline: true,
      isWifi: false,
      isCellular: true,
      connectionType: 'cellular',
    });
  });

  it('subscribeToConnectivity forwards isOnline and isWifi', async () => {
    const listener = jest.fn();
    const handlers: Array<(state: ConnectivityState) => void> = [];

    mockNetInfo.fetch.mockResolvedValue({
      isConnected: true,
      type: 'wifi',
    });
    mockNetInfo.addEventListener.mockImplementation(
      (handler: (state: ConnectivityState) => void) => {
        handlers.push(handler);
        return jest.fn();
      },
    );

    const unsubscribe = subscribeToConnectivity(listener);

    await waitFor(() => {
      expect(listener).toHaveBeenCalledWith(true, true, false, 'wifi');
    });

    handlers[0]?.({ isConnected: true, type: 'cellular' });

    await waitFor(() => {
      expect(listener).toHaveBeenCalledWith(true, false, true, 'cellular');
    });

    unsubscribe();
  });

  it('drops a stale /health probe that finishes after a newer one', async () => {
    const listener = jest.fn();
    const handlers: Array<(state: ConnectivityState) => void> = [];
    const pendingProbes: Array<(ok: boolean) => void> = [];

    fetchMock.mockImplementation(
      () =>
        new Promise<{ ok: boolean }>(resolve => {
          pendingProbes.push(ok => resolve({ ok }));
        }),
    );
    mockNetInfo.fetch.mockResolvedValue({
      isConnected: true,
      type: 'wifi',
    });
    mockNetInfo.addEventListener.mockImplementation(
      (handler: (state: ConnectivityState) => void) => {
        handlers.push(handler);
        return jest.fn();
      },
    );

    const unsubscribe = subscribeToConnectivity(listener);

    await waitFor(() => {
      expect(pendingProbes.length).toBe(1);
    });

    handlers[0]?.({
      isConnected: true,
      type: 'wifi',
      details: { ipAddress: '10.0.0.9' },
    });

    await waitFor(() => {
      expect(pendingProbes.length).toBe(2);
    });

    pendingProbes[1]?.(true);

    await waitFor(() => {
      expect(listener).toHaveBeenCalledWith(true, true, false, 'wifi');
    });

    pendingProbes[0]?.(false);
    await flushAsync();
    await flushAsync();

    expect(listener).not.toHaveBeenCalledWith(false, true, false, 'wifi');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('retries a failed /health probe after reconnect until it succeeds', async () => {
    const listener = jest.fn();
    const handlers: Array<(state: ConnectivityState) => void> = [];
    fetchMock.mockResolvedValueOnce({ ok: true });
    mockNetInfo.fetch.mockResolvedValue({
      isConnected: true,
      type: 'wifi',
    });
    mockNetInfo.addEventListener.mockImplementation(
      (handler: (state: ConnectivityState) => void) => {
        handlers.push(handler);
        return jest.fn();
      },
    );

    const unsubscribe = subscribeToConnectivity(listener, {
      delay: async () => undefined,
    });

    await waitFor(() => {
      expect(listener).toHaveBeenCalledWith(true, true, false, 'wifi');
    });

    fetchMock
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    handlers[0]?.({
      isConnected: true,
      type: 'wifi',
      details: { ipAddress: '10.0.0.9' },
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(listener).toHaveBeenCalledWith(false, true, false, 'wifi');
      expect(listener).toHaveBeenLastCalledWith(true, true, false, 'wifi');
    });

    unsubscribe();
  });

  it('does not report offline for an unknown first link state', async () => {
    const listener = jest.fn();
    const handlers: Array<(state: ConnectivityState) => void> = [];
    const unknown = { isConnected: false, type: 'unknown' };
    mockNetInfo.fetch.mockResolvedValue(unknown);
    mockNetInfo.addEventListener.mockImplementation(
      (handler: (state: ConnectivityState) => void) => {
        handlers.push(handler);
        handler(unknown);
        return jest.fn();
      },
    );

    const unsubscribe = subscribeToConnectivity(listener);
    await flushAsync();
    await flushAsync();

    expect(listener).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    mockNetInfo.fetch.mockResolvedValue({ isConnected: true, type: 'wifi' });
    handlers[0]?.({ isConnected: true, type: 'wifi' });

    await waitFor(() => {
      expect(listener).toHaveBeenCalledWith(true, true, false, 'wifi');
    });
    expect(listener).not.toHaveBeenCalledWith(false, false, false, 'unknown');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('does not report offline while NetInfo has no isConnected answer', async () => {
    const listener = jest.fn();
    const unknown = { isConnected: null, type: 'wifi' };
    mockNetInfo.fetch.mockResolvedValue(unknown);
    mockNetInfo.addEventListener.mockImplementation(
      (handler: (state: ConnectivityState) => void) => {
        handler(unknown);
        return jest.fn();
      },
    );

    const unsubscribe = subscribeToConnectivity(listener);
    await flushAsync();
    await flushAsync();

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('still reports offline at once when the link is known down', async () => {
    const listener = jest.fn();
    const down = { isConnected: false, type: 'none' };
    mockNetInfo.fetch.mockResolvedValue(down);
    mockNetInfo.addEventListener.mockImplementation(
      (handler: (state: ConnectivityState) => void) => {
        handler(down);
        return jest.fn();
      },
    );

    const unsubscribe = subscribeToConnectivity(listener);

    await waitFor(() => {
      expect(listener).toHaveBeenCalledWith(false, false, false, 'none');
    });
    expect(fetchMock).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('stops retrying when the link drops', async () => {
    const listener = jest.fn();
    const handlers: Array<(state: ConnectivityState) => void> = [];
    let releaseBackoff: () => void = () => undefined;
    const backoffGate = new Promise<void>(resolve => {
      releaseBackoff = resolve;
    });

    fetchMock.mockResolvedValue({ ok: false });
    mockNetInfo.fetch.mockResolvedValue({
      isConnected: true,
      type: 'wifi',
    });
    mockNetInfo.addEventListener.mockImplementation(
      (handler: (state: ConnectivityState) => void) => {
        handlers.push(handler);
        return jest.fn();
      },
    );

    const unsubscribe = subscribeToConnectivity(listener, {
      delay: () => backoffGate,
    });

    await waitFor(() => {
      expect(listener).toHaveBeenCalledWith(false, true, false, 'wifi');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    handlers[0]?.({ isConnected: false, type: 'none' });

    await waitFor(() => {
      expect(listener).toHaveBeenCalledWith(false, false, false, 'none');
    });

    releaseBackoff();
    await flushAsync();
    await flushAsync();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('subscribeToTransferTransport emits link state without waiting on /health', async () => {
    const listener = jest.fn();
    fetchMock.mockResolvedValue({ ok: false });

    mockNetInfo.fetch.mockResolvedValue({
      isConnected: true,
      type: 'wifi',
    });
    mockNetInfo.addEventListener.mockImplementation(() => jest.fn());

    const unsubscribe = subscribeToTransferTransport(listener);

    await waitFor(() => {
      expect(listener).toHaveBeenCalledWith({
        isLinkOnline: true,
        isWifi: true,
        isCellular: false,
        connectionType: 'wifi',
      });
    });
    expect(fetchMock).not.toHaveBeenCalled();

    unsubscribe();
  });

  describe('shared link observer (#886)', () => {
    const online = { isConnected: true, type: 'wifi' };
    let handlers: Array<(state: ConnectivityState) => void>;
    let removeListener: jest.Mock;

    beforeEach(() => {
      handlers = [];
      removeListener = jest.fn();
      mockNetInfo.fetch.mockResolvedValue(online);
      mockNetInfo.addEventListener.mockImplementation(
        (handler: (state: ConnectivityState) => void) => {
          handlers.push(handler);
          return removeListener;
        },
      );
    });

    const deliver = (state: ConnectivityState & Record<string, unknown>) => {
      for (const handler of [...handlers]) handler(state);
    };

    it('many subscribers share one NetInfo listener and one /health probe', async () => {
      const listeners = Array.from({ length: 8 }, () => jest.fn());
      const unsubs = listeners.map(listener =>
        subscribeToConnectivity(listener),
      );
      const transport = jest.fn();
      const unsubTransport = subscribeToTransferTransport(transport);

      await waitFor(() => {
        for (const listener of listeners) {
          expect(listener).toHaveBeenCalledWith(true, true, false, 'wifi');
        }
      });
      expect(mockNetInfo.addEventListener).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(transport).toHaveBeenCalledWith({
          isLinkOnline: true,
          isWifi: true,
          isCellular: false,
          connectionType: 'wifi',
        });
      });

      for (const unsub of unsubs) unsub();
      unsubTransport();
      expect(removeListener).toHaveBeenCalledTimes(1);
    });

    it('a NetInfo re-delivery of the same link state does not re-probe', async () => {
      const listener = jest.fn();
      const unsubscribe = subscribeToConnectivity(listener);
      await waitFor(() => {
        expect(listener).toHaveBeenCalledTimes(1);
      });

      // Native capability updates re-deliver unchanged link state.
      deliver({ ...online, isInternetReachable: null });
      deliver({ ...online, details: { strength: 40 } });
      await flushAsync();
      await flushAsync();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('a real link change re-probes once for all subscribers and is reported', async () => {
      const first = jest.fn();
      const second = jest.fn();
      const unsubFirst = subscribeToConnectivity(first);
      const unsubSecond = subscribeToConnectivity(second);
      await waitFor(() => {
        expect(second).toHaveBeenCalledWith(true, true, false, 'wifi');
      });

      deliver({ isConnected: true, type: 'cellular' });
      await waitFor(() => {
        expect(first).toHaveBeenLastCalledWith(true, false, true, 'cellular');
        expect(second).toHaveBeenLastCalledWith(true, false, true, 'cellular');
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);

      deliver({ isConnected: false, type: 'none' });
      await waitFor(() => {
        expect(first).toHaveBeenLastCalledWith(false, false, false, 'none');
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);

      deliver({ isConnected: true, type: 'wifi' });
      await waitFor(() => {
        expect(second).toHaveBeenLastCalledWith(true, true, false, 'wifi');
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      unsubFirst();
      unsubSecond();
    });

    it('a late subscriber reuses a fresh shared result and re-probes once it is stale', async () => {
      const baseMs = Date.now();
      let clockOffsetMs = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => baseMs + clockOffsetMs);
      const unsubFirst = subscribeToConnectivity(jest.fn());
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
      await flushAsync();

      const late = jest.fn();
      const unsubLate = subscribeToConnectivity(late);
      await waitFor(() => {
        expect(late).toHaveBeenCalledWith(true, true, false, 'wifi');
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      clockOffsetMs = SERVER_REACHABILITY_FRESH_MS + 1;
      fetchMock.mockResolvedValue({ ok: false });
      const later = jest.fn();
      const unsubLater = subscribeToConnectivity(later, {
        delay: () => new Promise(() => undefined),
      });
      await waitFor(() => {
        expect(later).toHaveBeenCalledWith(false, true, false, 'wifi');
        expect(late).toHaveBeenLastCalledWith(false, true, false, 'wifi');
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      unsubFirst();
      unsubLate();
      unsubLater();
    });

    it('a subscriber joining during retry backoff gets the current result without a probe', async () => {
      fetchMock.mockResolvedValue({ ok: false });
      let releaseBackoff: () => void = () => undefined;
      const unsubFirst = subscribeToConnectivity(jest.fn(), {
        delay: () =>
          new Promise<void>(resolve => {
            releaseBackoff = resolve;
          }),
      });
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      const joiner = jest.fn();
      const unsubJoiner = subscribeToConnectivity(joiner);
      await waitFor(() => {
        expect(joiner).toHaveBeenCalledWith(false, true, false, 'wifi');
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      fetchMock.mockResolvedValue({ ok: true });
      releaseBackoff();
      await waitFor(() => {
        expect(joiner).toHaveBeenLastCalledWith(true, true, false, 'wifi');
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      unsubFirst();
      unsubJoiner();
    });

    it('a NetInfo fetch failure reads as unreachable and keeps retrying', async () => {
      const listener = jest.fn();
      const unsubscribe = subscribeToConnectivity(listener, {
        delay: async () => undefined,
      });
      await waitFor(() => {
        expect(listener).toHaveBeenCalledWith(true, true, false, 'wifi');
      });

      mockNetInfo.fetch
        .mockRejectedValueOnce(new Error('netinfo unavailable'))
        .mockResolvedValue({ isConnected: true, type: 'cellular' });
      deliver({ isConnected: true, type: 'cellular' });
      await waitFor(() => {
        expect(listener).toHaveBeenCalledWith(false, false, true, 'cellular');
        expect(listener).toHaveBeenLastCalledWith(
          true,
          false,
          true,
          'cellular',
        );
      });
      unsubscribe();
    });

    it('the last unsubscribe removes the listener and ends retries; a new subscriber starts over', async () => {
      fetchMock.mockResolvedValue({ ok: false });
      let releaseBackoff: () => void = () => undefined;
      const unsubscribe = subscribeToConnectivity(jest.fn(), {
        delay: () =>
          new Promise<void>(resolve => {
            releaseBackoff = resolve;
          }),
      });
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      unsubscribe();
      expect(removeListener).toHaveBeenCalledTimes(1);
      releaseBackoff();
      await flushAsync();
      await flushAsync();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      fetchMock.mockResolvedValue({ ok: true });
      const next = jest.fn();
      const unsubNext = subscribeToConnectivity(next);
      await waitFor(() => {
        expect(next).toHaveBeenCalledWith(true, true, false, 'wifi');
      });
      expect(mockNetInfo.addEventListener).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      unsubNext();
    });

    it('an unsubscribed listener is not called by a probe that finishes later', async () => {
      let releaseProbe: ((value: { ok: boolean }) => void) | undefined;
      fetchMock.mockImplementationOnce(
        () =>
          new Promise<{ ok: boolean }>(resolve => {
            releaseProbe = resolve;
          }),
      );
      const gone = jest.fn();
      const stays = jest.fn();
      const unsubGone = subscribeToConnectivity(gone);
      const unsubStays = subscribeToConnectivity(stays);
      await waitFor(() => {
        expect(releaseProbe).toBeDefined();
      });
      unsubGone();
      releaseProbe?.({ ok: true });
      await waitFor(() => {
        expect(stays).toHaveBeenCalledWith(true, true, false, 'wifi');
      });
      expect(gone).not.toHaveBeenCalled();
      unsubStays();
    });

    it('a probe already running when the first link state arrives is shared, not repeated', async () => {
      let releaseProbe: ((value: { ok: boolean }) => void) | undefined;
      fetchMock.mockImplementationOnce(
        () =>
          new Promise<{ ok: boolean }>(resolve => {
            releaseProbe = resolve;
          }),
      );
      mockNetInfo.addEventListener.mockImplementation(
        (handler: (state: ConnectivityState) => void) => {
          handlers.push(handler);
          return removeListener;
        },
      );
      // First fetch (observer start) stays pending; the light refresh probes meanwhile.
      let releaseFirstState: (() => void) | undefined;
      mockNetInfo.fetch.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            releaseFirstState = () => resolve(online);
          }),
      );
      const listener = jest.fn();
      const unsubscribe = subscribeToConnectivity(listener);
      const refresh = getConnectivitySnapshot({
        maxAgeMs: SERVER_REACHABILITY_FRESH_MS,
      });
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      releaseFirstState?.();
      await flushAsync();
      releaseProbe?.({ ok: true });
      await expect(refresh).resolves.toMatchObject({ isOnline: true });
      await waitFor(() => {
        expect(listener).toHaveBeenCalledWith(true, true, false, 'wifi');
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('a result cached before observation started is not reused', async () => {
      await getConnectivitySnapshot();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const unsubscribe = subscribeToConnectivity(jest.fn());
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });
      unsubscribe();
    });

    it('callers that accept a recent result reuse the observer probe (light refresh)', async () => {
      const unsubscribe = subscribeToConnectivity(jest.fn());
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
      await flushAsync();

      await expect(
        getConnectivitySnapshot({ maxAgeMs: SERVER_REACHABILITY_FRESH_MS }),
      ).resolves.toMatchObject({ isOnline: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Explicit fresh callers still probe.
      await getConnectivitySnapshot();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      unsubscribe();
    });

    it('handles the synchronous first delivery from addEventListener', async () => {
      mockNetInfo.addEventListener.mockImplementation(
        (handler: (state: ConnectivityState) => void) => {
          handlers.push(handler);
          handler(online);
          return removeListener;
        },
      );
      const listener = jest.fn();
      const unsubscribe = subscribeToConnectivity(listener);
      await waitFor(() => {
        expect(listener).toHaveBeenCalledWith(true, true, false, 'wifi');
      });
      await flushAsync();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      unsubscribe();
      expect(removeListener).toHaveBeenCalledTimes(1);
    });

    it('an isInternetReachable change re-probes', async () => {
      const listener = jest.fn();
      const unsubscribe = subscribeToConnectivity(listener, {
        delay: () => new Promise(() => undefined),
      });
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
      await flushAsync();

      fetchMock.mockResolvedValue({ ok: false });
      deliver({ ...online, isInternetReachable: false });
      await waitFor(() => {
        expect(listener).toHaveBeenLastCalledWith(false, true, false, 'wifi');
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      unsubscribe();
    });

    it('a late subscriber does not receive a result older than one already published', async () => {
      const unsubFirst = subscribeToConnectivity(jest.fn());
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
      await flushAsync();

      const late = jest.fn();
      const unsubLate = subscribeToConnectivity(late);
      // The link drops before the catch-up microtask runs.
      deliver({ isConnected: false, type: 'none' });
      await flushAsync();

      expect(late.mock.calls).toEqual([[false, false, false, 'none']]);
      unsubFirst();
      unsubLate();
    });

    it('a throwing subscriber does not stop delivery to the others', async () => {
      const throwing = jest.fn(() => {
        throw new Error('boom');
      });
      const throwingTransport = jest.fn(() => {
        throw new Error('boom');
      });
      const listener = jest.fn();
      const unsubs = [
        subscribeToConnectivity(throwing),
        subscribeToTransferTransport(throwingTransport),
        subscribeToConnectivity(listener),
      ];
      await waitFor(() => {
        expect(listener).toHaveBeenCalledWith(true, true, false, 'wifi');
      });

      fetchMock.mockResolvedValue({ ok: false });
      deliver({ isConnected: true, type: 'cellular' });
      await waitFor(() => {
        expect(listener).toHaveBeenLastCalledWith(
          false,
          false,
          true,
          'cellular',
        );
      });
      expect(throwingTransport).toHaveBeenCalled();
      for (const unsub of unsubs) unsub();
    });
  });
});
