import { renderHook, waitFor } from '@testing-library/react-native';
import {
  getConnectivitySnapshot,
  getTransferTransportSnapshot,
  subscribeToConnectivity,
  subscribeToTransferTransport,
} from '../services/connectivity';
import { useConnectivity } from './useConnectivity';

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock('../services/connectivity', () => ({
  getConnectivitySnapshot: jest.fn(),
  getTransferTransportSnapshot: jest.fn(),
  subscribeToConnectivity: jest.fn(),
  subscribeToTransferTransport: jest.fn(),
}));

const mockGetConnectivitySnapshot =
  getConnectivitySnapshot as jest.MockedFunction<
    typeof getConnectivitySnapshot
  >;
const mockGetTransferTransportSnapshot =
  getTransferTransportSnapshot as jest.MockedFunction<
    typeof getTransferTransportSnapshot
  >;
const mockSubscribeToConnectivity =
  subscribeToConnectivity as jest.MockedFunction<
    typeof subscribeToConnectivity
  >;
const mockSubscribeToTransferTransport =
  subscribeToTransferTransport as jest.MockedFunction<
    typeof subscribeToTransferTransport
  >;

describe('useConnectivity', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockSubscribeToConnectivity.mockImplementation(listener => {
      listener(true, true, false, 'wifi');
      return jest.fn();
    });
    mockSubscribeToTransferTransport.mockImplementation(listener => {
      listener({
        isLinkOnline: true,
        isWifi: true,
        isCellular: false,
        connectionType: 'wifi',
      });
      return jest.fn();
    });
    mockGetConnectivitySnapshot.mockResolvedValue({
      isOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });
    mockGetTransferTransportSnapshot.mockResolvedValue({
      isLinkOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });
  });

  it('marks connectivity as resolved after receiving a connectivity update', async () => {
    const { result } = renderHook(() => useConnectivity());

    await waitFor(() => {
      expect(result.current.hasResolved).toBe(true);
      expect(result.current.connectivityPending).toBe(false);
      expect(result.current.hasTransferResolved).toBe(true);
      expect(result.current.transferConnectivityPending).toBe(false);
      expect(result.current.isLinkOnline).toBe(true);
    });
  });

  it('reports connectivity as pending before the first snapshot resolves', () => {
    mockSubscribeToConnectivity.mockImplementation(() => jest.fn());
    mockSubscribeToTransferTransport.mockImplementation(() => jest.fn());
    mockGetConnectivitySnapshot.mockReturnValue(new Promise(() => undefined));
    mockGetTransferTransportSnapshot.mockReturnValue(
      new Promise(() => undefined),
    );

    const { result } = renderHook(() => useConnectivity());

    expect(result.current.connectivityPending).toBe(true);
    expect(result.current.hasResolved).toBe(false);
    expect(result.current.transferConnectivityPending).toBe(true);
    expect(result.current.hasTransferResolved).toBe(false);
  });

  it('keeps link online when Fluent health is down', async () => {
    mockSubscribeToConnectivity.mockImplementation(listener => {
      listener(false, true, false, 'wifi');
      return jest.fn();
    });
    mockGetConnectivitySnapshot.mockResolvedValue({
      isOnline: false,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });

    const { result } = renderHook(() => useConnectivity());

    await waitFor(() => {
      expect(result.current.isOnline).toBe(false);
      expect(result.current.isLinkOnline).toBe(true);
    });
  });
});
