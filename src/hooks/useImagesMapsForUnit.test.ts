import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useImagesMapsForUnit } from './useImagesMapsForUnit';
import { setMockImagesMapsLoadFailure } from '../mocks/resources/imagesMapsMock';

describe('useImagesMapsForUnit', () => {
  afterEach(() => {
    setMockImagesMapsLoadFailure(false);
  });

  it('loads mock items for units that have Images & Maps', async () => {
    const { result } = renderHook(() => useImagesMapsForUnit(10, 2));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    if (result.current.state.status !== 'ready') {
      throw new Error('expected ready state');
    }
    expect(result.current.state.items.length).toBeGreaterThan(0);
  });

  it('exposes an error state that retry can clear', async () => {
    setMockImagesMapsLoadFailure(true);
    const { result } = renderHook(() => useImagesMapsForUnit(10, 2));

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    setMockImagesMapsLoadFailure(false);
    await act(async () => {
      await result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
  });
});
