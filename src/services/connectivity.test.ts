import NetInfo from '@react-native-community/netinfo';
import { waitFor } from '@testing-library/react-native';
import {
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
