import { renderHook, waitFor } from '@testing-library/react-native';
import {
  getConnectivitySnapshot,
  subscribeToConnectivity,
} from '../services/connectivity';
import { useConnectivity } from './useConnectivity';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock('../services/connectivity', () => ({
  getConnectivitySnapshot: jest.fn(),
  subscribeToConnectivity: jest.fn(),
}));

const mockGetConnectivitySnapshot =
  getConnectivitySnapshot as jest.MockedFunction<
    typeof getConnectivitySnapshot
  >;
const mockSubscribeToConnectivity =
  subscribeToConnectivity as jest.MockedFunction<
    typeof subscribeToConnectivity
  >;

describe('useConnectivity', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockSubscribeToConnectivity.mockImplementation(listener => {
      listener(true, true, false);
      return jest.fn();
    });
    mockGetConnectivitySnapshot.mockResolvedValue({
      isOnline: true,
      isWifi: true,
      isCellular: false,
    });
  });

  it('marks connectivity as resolved after receiving a connectivity update', async () => {
    const { result } = renderHook(() => useConnectivity());

    await waitFor(() => {
      expect(result.current.hasResolved).toBe(true);
    });
  });
});
