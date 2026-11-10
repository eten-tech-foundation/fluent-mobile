jest.mock('@op-engineering/op-sqlite', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    getItemSync: jest.fn(() => null),
    setItemSync: jest.fn(),
    removeItemSync: jest.fn(),
  })),
}));

const mockGetActiveUserId = jest.fn();
const mockGetKnownUserIds = jest.fn();
const mockGetUserEmail = jest.fn();

jest.mock('../services/storage', () => ({
  getActiveUserId: () => mockGetActiveUserId(),
  getKnownUserIds: () => mockGetKnownUserIds(),
  getUserEmail: (userId: string) => mockGetUserEmail(userId),
  MAX_DEVICE_ACCOUNTS: 3,
}));

import type { DB, QueryResult } from '@op-engineering/op-sqlite';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { setDatabase } from './db';
import { runMigrations } from './migrations';
import { getUserById } from './queries';
import { useActiveAccountSummary } from '../hooks/useActiveAccountSummary';
import { useDeviceAccounts } from '../hooks/useDeviceAccounts';
import { createRealSqliteDb, isNodeSqliteAvailable } from '../test/realSqlite';

const describeReal = isNodeSqliteAvailable() ? describe : describe.skip;

const isUserRead = (sql: unknown) => String(sql).includes('FROM users');

async function addUser(db: DB, id: number, first: string | null) {
  await db.execute(
    'INSERT INTO users (id, username, email, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
    [id, `u${id}`, `u${id}@example.com`, first, first ? 'Last' : null],
  );
}

/** Users table reads the db has been asked for since `spy` was installed. */
function userReads(spy: jest.SpyInstance) {
  return spy.mock.calls.filter(([sql]) => isUserRead(sql)).length;
}

describeReal('getUserById (real SQLite)', () => {
  let db: DB;
  let spy: jest.SpyInstance;

  beforeEach(async () => {
    db = createRealSqliteDb();
    await runMigrations(db);
    setDatabase(db);
    await addUser(db, 4, 'Ada');
    await addUser(db, 5, 'Bo');
    spy = jest.spyOn(db, 'execute');
    mockGetActiveUserId.mockReturnValue('4');
    mockGetKnownUserIds.mockReturnValue(['4']);
    mockGetUserEmail.mockImplementation((id: string) => `kv-${id}@example.com`);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    db.close();
  });

  it('shares one read between callers in the same synchronous turn', async () => {
    const [a, b] = await Promise.all([getUserById(4), getUserById(4)]);

    expect(userReads(spy)).toBe(1);
    expect(a).toEqual({
      id: 4,
      username: 'u4',
      email: 'u4@example.com',
      firstName: 'Ada',
      lastName: 'Last',
    });
    expect(b).toEqual(a);
  });

  it('gives each caller its own copy', async () => {
    const [a, b] = await Promise.all([getUserById(4), getUserById(4)]);

    a!.firstName = 'Changed';

    expect(b!.firstName).toBe('Ada');
    expect((await getUserById(4))!.firstName).toBe('Ada');
  });

  it('reads again in a later turn and sees a written profile change', async () => {
    expect((await getUserById(4))!.firstName).toBe('Ada');

    await db.execute('UPDATE users SET first_name = ? WHERE id = 4', ['Grace']);

    expect((await getUserById(4))!.firstName).toBe('Grace');
    expect(userReads(spy)).toBe(2);
  });

  it('does not share between different users', async () => {
    const [a, b] = await Promise.all([getUserById(4), getUserById(5)]);

    expect(userReads(spy)).toBe(2);
    expect(a!.firstName).toBe('Ada');
    expect(b!.firstName).toBe('Bo');
  });

  it('does not share across a replaced database', async () => {
    const other = createRealSqliteDb();
    await runMigrations(other);
    await addUser(other, 4, 'Other');
    try {
      const first = getUserById(4);
      setDatabase(other);
      const second = getUserById(4);

      expect((await first)!.firstName).toBe('Ada');
      expect((await second)!.firstName).toBe('Other');
    } finally {
      setDatabase(db);
      other.close();
    }
  });

  it('reads again after a failed read, and sharing a failure stays inside the turn', async () => {
    spy.mockImplementationOnce(async () => {
      throw new Error('locked');
    });

    const [failedA, failedB] = await Promise.all([
      getUserById(4),
      getUserById(4),
    ]);
    expect(failedA).toBeNull();
    expect(failedB).toBeNull();

    expect((await getUserById(4))!.firstName).toBe('Ada');
  });

  it('resolves null for an unknown user and for an unopened database', async () => {
    expect(await getUserById(99)).toBeNull();
    spy.mockImplementation(() => {
      throw new Error('Database not initialized');
    });
    expect(await getUserById(4)).toBeNull();
  });

  describe('launch hooks together', () => {
    function useBoth(refreshKey = 0) {
      return {
        summary: useActiveAccountSummary(refreshKey),
        devices: useDeviceAccounts(true),
      };
    }

    it('reads the profile once and both consumers show the same account', async () => {
      const { result } = renderHook(() => useBoth());

      await waitFor(() => {
        expect(result.current.summary.firstName).toBe('Ada');
        expect(result.current.devices.accounts).toHaveLength(1);
      });

      expect(userReads(spy)).toBe(1);
      expect(result.current.summary.email).toBe('u4@example.com');
      expect(result.current.devices.accounts[0]).toMatchObject({
        userId: '4',
        displayName: 'Ada Last',
        email: 'u4@example.com',
        isActive: true,
      });
    });

    it('lets a later refresh pick up a profile update', async () => {
      const { result, rerender } = renderHook(
        ({ key }: { key: number }) => useBoth(key),
        { initialProps: { key: 0 } },
      );
      await waitFor(() => expect(result.current.summary.firstName).toBe('Ada'));

      await db.execute('UPDATE users SET first_name = ? WHERE id = 4', [
        'Grace',
      ]);
      rerender({ key: 1 });

      await waitFor(() =>
        expect(result.current.summary.firstName).toBe('Grace'),
      );
      await act(async () => {
        await result.current.devices.reload();
      });
      expect(result.current.devices.accounts[0].displayName).toBe('Grace Last');
    });

    it('never lets an older account read overwrite the current account', async () => {
      let release!: (value: QueryResult) => void;
      // The first users read (account 4) hangs until released.
      spy.mockImplementationOnce(
        () =>
          new Promise<QueryResult>(resolve => {
            release = resolve;
          }),
      );
      mockGetKnownUserIds.mockReturnValue(['4', '5']);

      const { result, rerender } = renderHook(
        ({ key }: { key: number }) => useActiveAccountSummary(key),
        { initialProps: { key: 0 } },
      );

      // Switch to account 5 while account 4's read is still out.
      mockGetActiveUserId.mockReturnValue('5');
      rerender({ key: 1 });
      await waitFor(() => expect(result.current.firstName).toBe('Bo'));

      await act(async () => {
        release({
          rows: [
            {
              id: 4,
              username: 'u4',
              email: 'u4@example.com',
              first_name: 'Ada',
              last_name: 'Last',
            },
          ],
        } as unknown as QueryResult);
        await Promise.resolve();
      });

      expect(result.current.activeUserId).toBe('5');
      expect(result.current.firstName).toBe('Bo');
    });
  });
});
