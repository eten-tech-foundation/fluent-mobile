import { act, renderHook } from '@testing-library/react-native';
import { UNDO_MS, usePendingDelete } from './usePendingDelete';

const mockLogError = jest.fn();
jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      error: (...args: unknown[]) => mockLogError(...args),
    }),
  },
}));

describe('usePendingDelete', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('commits a delete once the undo window closes', async () => {
    const commitDelete = jest.fn(async () => {});
    const { result } = renderHook(() => usePendingDelete(commitDelete));

    act(() => result.current.remove({ id: 'a', takeNumber: 1 }));
    expect(result.current.pending).toEqual({ id: 'a', takeNumber: 1 });
    expect(commitDelete).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(UNDO_MS);
    });
    expect(commitDelete).toHaveBeenCalledWith('a');
    expect(result.current.pending).toBeNull();
    expect(result.current.hiddenIds.size).toBe(0);
  });

  it('never commits an undone delete', () => {
    const commitDelete = jest.fn(async () => {});
    const { result } = renderHook(() => usePendingDelete(commitDelete));

    act(() => result.current.remove({ id: 'a', takeNumber: 1 }));
    act(() => result.current.undo());
    act(() => jest.advanceTimersByTime(UNDO_MS));

    expect(commitDelete).not.toHaveBeenCalled();
    expect(result.current.pending).toBeNull();
  });

  it('hides a committing take until its delete returns', async () => {
    let finish = () => {};
    const commitDelete = jest.fn(
      () => new Promise<void>(resolve => (finish = resolve)),
    );
    const { result } = renderHook(() => usePendingDelete(commitDelete));

    act(() => result.current.remove({ id: 'a', takeNumber: 1 }));
    await act(async () => void result.current.commit());
    expect(result.current.hiddenIds.has('a')).toBe(true);

    await act(async () => finish());
    expect(result.current.hiddenIds.has('a')).toBe(false);
  });

  it('waits for a commit already under way', async () => {
    let finish = () => {};
    const commitDelete = jest.fn(
      () => new Promise<void>(resolve => (finish = resolve)),
    );
    const { result } = renderHook(() => usePendingDelete(commitDelete));
    let done = false;

    act(() => result.current.remove({ id: 'a', takeNumber: 1 }));
    await act(async () => {
      jest.advanceTimersByTime(UNDO_MS);
    });
    act(() => {
      void result.current.commit().then(() => (done = true));
    });
    await act(async () => {});
    expect(done).toBe(false);

    await act(async () => finish());
    expect(done).toBe(true);
  });

  it('commits the first delete when a second one starts', async () => {
    const commitDelete = jest.fn(async () => {});
    const { result } = renderHook(() => usePendingDelete(commitDelete));

    act(() => result.current.remove({ id: 'a', takeNumber: 1 }));
    await act(async () => result.current.remove({ id: 'b', takeNumber: 2 }));

    expect(commitDelete).toHaveBeenCalledWith('a');
    expect(result.current.pending?.id).toBe('b');
  });

  it('commits a pending delete on unmount', async () => {
    const commitDelete = jest.fn(async () => {});
    const { result, unmount } = renderHook(() =>
      usePendingDelete(commitDelete),
    );

    act(() => result.current.remove({ id: 'a', takeNumber: 1 }));
    unmount();
    await act(async () => {});

    expect(commitDelete).toHaveBeenCalledWith('a');
  });

  it('logs a failed delete and shows the take again', async () => {
    const error = new Error('db closed');
    const commitDelete = jest.fn(() => Promise.reject(error));
    const { result } = renderHook(() => usePendingDelete(commitDelete));

    act(() => result.current.remove({ id: 'a', takeNumber: 1 }));
    await act(async () => result.current.commit());

    expect(mockLogError).toHaveBeenCalledWith('Failed to delete take', {
      error,
    });
    expect(result.current.hiddenIds.has('a')).toBe(false);
  });
});
