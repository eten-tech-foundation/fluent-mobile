import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useHeldRecordings } from './useHeldRecordings';
import type { HeldRecording } from '../db/repositories/heldRecordingsRepository';

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
}));

const mockGetHeldRecordings = jest.fn();
jest.mock('../db/repositories/heldRecordingsRepository', () => ({
  getHeldRecordings: (...args: unknown[]) => mockGetHeldRecordings(...args),
}));

let mockActiveUserId: string | null = '1';
let mockEpoch = 0;
jest.mock('../navigation/AuthSessionProvider', () => ({
  useAuthSession: () => ({ userSwitchEpoch: mockEpoch }),
}));
jest.mock('../services/storage', () => ({
  getActiveUserId: () => mockActiveUserId,
}));

let heldChangedListener: (() => void) | null = null;
jest.mock('../services/syncEvents', () => ({
  onUploadSessionEvent: () => () => {},
  onHeldRecordingsChanged: (fn: () => void) => {
    heldChangedListener = fn;
    return () => {
      heldChangedListener = null;
    };
  },
}));

function held(id: string): HeldRecording {
  return { id } as unknown as HeldRecording;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useHeldRecordings (#855)', () => {
  // The hook loads twice on mount (focus effect + refreshKey effect), so the
  // repository mock answers per account instead of once.
  let rowsFor: (userId: number) => Promise<HeldRecording[]>;

  beforeEach(() => {
    jest.resetAllMocks();
    mockActiveUserId = '1';
    mockEpoch = 0;
    heldChangedListener = null;
    rowsFor = async () => [];
    mockGetHeldRecordings.mockImplementation((userId: number) =>
      rowsFor(userId),
    );
  });

  it('publishes the active account rows', async () => {
    rowsFor = async () => [held('a')];

    const { result } = await renderHook(() => useHeldRecordings());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetHeldRecordings).toHaveBeenCalledWith(1);
    expect(result.current.recordings.map(r => r.id)).toEqual(['a']);
  });

  it('reloads when held recordings change', async () => {
    rowsFor = async () => [held('a')];
    const { result } = await renderHook(() => useHeldRecordings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    rowsFor = async () => [held('a'), held('b')];
    await act(async () => {
      heldChangedListener?.();
    });

    await waitFor(() =>
      expect(result.current.recordings.map(r => r.id)).toEqual(['a', 'b']),
    );
  });

  it('drops a load that resolves after the active account changed', async () => {
    const slow = deferred<HeldRecording[]>();
    rowsFor = () => slow.promise;
    const { result } = await renderHook(() => useHeldRecordings());

    // The account switches while account 1's load is still in flight.
    mockActiveUserId = '2';
    await act(async () => {
      slow.resolve([held('account-1-take')]);
      await slow.promise;
    });

    expect(result.current.recordings).toEqual([]);
  });

  it("clears the previous account's rows as soon as the next load runs", async () => {
    rowsFor = async () => [held('account-1-take')];
    const { result } = await renderHook(() => useHeldRecordings());
    await waitFor(() =>
      expect(result.current.recordings.map(r => r.id)).toEqual([
        'account-1-take',
      ]),
    );

    mockActiveUserId = '2';
    const next = deferred<HeldRecording[]>();
    rowsFor = () => next.promise;
    await act(async () => {
      heldChangedListener?.();
    });

    // Account 2's load has not resolved yet: account 1's rows must be gone.
    expect(result.current.recordings).toEqual([]);

    await act(async () => {
      next.resolve([held('account-2-take')]);
      await next.promise;
    });
    expect(result.current.recordings.map(r => r.id)).toEqual([
      'account-2-take',
    ]);
  });

  it("hides the previous account's rows on render after a switch, before any reload", async () => {
    rowsFor = async () => [held('account-1-take')];
    const { result, rerender } = await renderHook(() => useHeldRecordings());
    await waitFor(() =>
      expect(result.current.recordings.map(r => r.id)).toEqual([
        'account-1-take',
      ]),
    );
    const loadsBeforeSwitch = mockGetHeldRecordings.mock.calls.length;

    // The screen stays mounted through the switch: no load, no event, only a
    // re-render (focus return, connectivity change, ...).
    mockActiveUserId = '2';
    await rerender({});

    expect(result.current.recordings).toEqual([]);
    expect(mockGetHeldRecordings.mock.calls.length).toBe(loadsBeforeSwitch);
  });

  it("loads the new account's rows when the switch epoch bumps while mounted", async () => {
    rowsFor = async userId => [held(`account-${userId}-take`)];
    const { result, rerender } = await renderHook(() => useHeldRecordings());
    await waitFor(() =>
      expect(result.current.recordings.map(r => r.id)).toEqual([
        'account-1-take',
      ]),
    );

    // notifyUserSwitched: the active account changes and the epoch bumps; no
    // focus change and no held-changed event.
    mockActiveUserId = '2';
    mockEpoch = 1;
    await rerender({});

    await waitFor(() =>
      expect(result.current.recordings.map(r => r.id)).toEqual([
        'account-2-take',
      ]),
    );
  });

  it('clears the list when nobody is signed in', async () => {
    rowsFor = async () => [held('a')];
    const { result } = await renderHook(() => useHeldRecordings());
    await waitFor(() => expect(result.current.recordings).toHaveLength(1));

    mockActiveUserId = null;
    await act(async () => {
      heldChangedListener?.();
    });

    expect(result.current.recordings).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});
