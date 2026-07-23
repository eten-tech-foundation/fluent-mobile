import NetInfo from '@react-native-community/netinfo';
import { waitFor } from '@testing-library/react-native';
import {
  getConnectivitySnapshot,
  subscribeToConnectivity,
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
      expect(listener).toHaveBeenCalledWith(true, true, false);
    });

    handlers[0]?.({ isConnected: true, type: 'cellular' });

    await waitFor(() => {
      expect(listener).toHaveBeenCalledWith(true, false, true);
    });

    unsubscribe();
  });
});
