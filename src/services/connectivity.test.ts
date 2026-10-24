import * as apiBaseUrl from '../config/apiBaseUrl';
import NetInfo from '@react-native-community/netinfo';
import { waitFor } from '@testing-library/react-native';
import {
  checkServerReachable,
  resolveServerOnline,
  getConnectivitySnapshot,
  getTransferTransportSnapshot,
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
};

const flushAsync = () =>
  new Promise<void>(resolve => {
    setImmediate(resolve);
  });

describe('connectivity', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
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

    handlers[0]?.({ isConnected: true, type: 'wifi' });

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
    handlers[0]?.({ isConnected: true, type: 'wifi' });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(listener).toHaveBeenCalledWith(false, true, false, 'wifi');
      expect(listener).toHaveBeenLastCalledWith(true, true, false, 'wifi');
    });

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
});

describe('temporary QA717 allowlisted health trace', () => {
  const secret = 'secret-token-body-header';
  const originalDev = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');

  beforeEach(() => {
    jest.resetAllMocks();
    Object.defineProperty(globalThis, '__DEV__', {
      value: true,
      configurable: true,
    });
    jest
      .spyOn(apiBaseUrl, 'getApiBaseUrl')
      .mockReturnValue(
        `https://user:password@qa.api.fluent.bible/private-path?token=${secret}`,
      );
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalDev) Object.defineProperty(globalThis, '__DEV__', originalDev);
  });

  it.each([
    ['success', true, 200],
    ['http_error', false, 503],
    ['AbortError', false, null],
    ['networkError', false, null],
  ] as const)(
    'logs only primitives for %s and preserves the return',
    async (kind, expected, status) => {
      const info = jest
        .spyOn(console, 'info')
        .mockImplementation(() => undefined);
      const error = new Error(secret);
      error.name = kind === 'AbortError' ? 'AbortError' : secret;
      const response = {
        ok: expected,
        status,
        headers: secret,
        body: secret,
        text: jest.fn(() => {
          throw new Error('Response body must not be read');
        }),
      };
      const request = jest.spyOn(globalThis, 'fetch');
      if (kind === 'AbortError' || kind === 'networkError')
        request.mockRejectedValue(error);
      else request.mockResolvedValue(response as unknown as Response);
      mockNetInfo.fetch.mockResolvedValue({ isConnected: true, type: 'wifi' });

      await expect(getConnectivitySnapshot()).resolves.toEqual({
        isOnline: expected,
        isWifi: true,
        isCellular: false,
        connectionType: 'wifi',
      });
      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'GET',
          signal: expect.any(AbortSignal),
        }),
      );
      expect(response.text).not.toHaveBeenCalled();
      expect(info).toHaveBeenCalledTimes(1);
      const [prefix, trace] = info.mock.calls[0];
      expect(prefix).toBe('[FLUENT_QA717_HEALTH_V1]');
      expect(trace).toEqual({
        host: 'qa.api.fluent.bible',
        isConnected: true,
        connectionType: 'wifi',
        result: kind,
        httpStatus: status,
        elapsedMs: expect.any(Number),
      });
      expect(Object.keys(trace).sort()).toEqual(
        [
          'host',
          'isConnected',
          'connectionType',
          'result',
          'httpStatus',
          'elapsedMs',
        ].sort(),
      );
      for (const forbidden of [
        secret,
        'password',
        '/private-path',
        'token=',
        'headers',
        'stack',
      ]) {
        expect(JSON.stringify(info.mock.calls)).not.toContain(forbidden);
      }
    },
  );

  it('traces a disconnected link without adding a health request', async () => {
    const info = jest
      .spyOn(console, 'info')
      .mockImplementation(() => undefined);
    const request = jest.spyOn(globalThis, 'fetch');
    await expect(resolveServerOnline(false, secret)).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      '[FLUENT_QA717_HEALTH_V1]',
      expect.objectContaining({
        result: 'link_disconnected',
        isConnected: false,
        connectionType: 'unknown',
      }),
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain(secret);
  });

  it('preserves timeout cancellation and emits AbortError without raw exception fields', async () => {
    jest.useFakeTimers();
    try {
      const info = jest
        .spyOn(console, 'info')
        .mockImplementation(() => undefined);
      const request = jest.spyOn(globalThis, 'fetch').mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new Error(secret)),
            );
          }),
      );
      const result = checkServerReachable();
      await jest.advanceTimersByTimeAsync(5000);
      await expect(result).resolves.toBe(false);
      expect(request).toHaveBeenCalledTimes(1);
      expect(info).toHaveBeenCalledWith(
        '[FLUENT_QA717_HEALTH_V1]',
        expect.objectContaining({
          result: 'AbortError',
          elapsedMs: 5000,
        }),
      );
      expect(JSON.stringify(info.mock.calls)).not.toContain(secret);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not log when DEV is disabled or let a logging failure change the result', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {
      throw new Error(secret);
    });
    const request = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);
    await expect(checkServerReachable()).resolves.toBe(true);
    Object.defineProperty(globalThis, '__DEV__', {
      value: false,
      configurable: true,
    });
    info.mockClear();
    await expect(checkServerReachable()).resolves.toBe(true);
    expect(info).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(2);
  });
});
