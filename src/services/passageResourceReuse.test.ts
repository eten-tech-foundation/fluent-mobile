import { ApiError } from '../types/api/errors';
import {
  clearPassageResourceReuse,
  PASSAGE_RESOURCE_FAILURE_HOLD_MS,
  PASSAGE_RESOURCE_REUSE_TTL_MS,
  reusePassageResource,
} from './passageResourceReuse';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('reusePassageResource', () => {
  beforeEach(() => {
    clearPassageResourceReuse();
    jest.useRealTimers();
  });

  it('answers a reopen from the first answer, empty ones included', async () => {
    const fetch = jest.fn().mockResolvedValue([]);
    await expect(reusePassageResource('7', 'notes:1', fetch)).resolves.toEqual(
      [],
    );
    await expect(reusePassageResource('7', 'notes:1', fetch)).resolves.toEqual(
      [],
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('joins a request still in flight instead of starting another', async () => {
    const first = deferred<string[]>();
    const fetch = jest.fn().mockReturnValueOnce(first.promise);
    const a = reusePassageResource('7', 'notes:1', fetch);
    const b = reusePassageResource('7', 'notes:1', fetch);
    first.resolve(['n']);
    await expect(a).resolves.toEqual(['n']);
    await expect(b).resolves.toEqual(['n']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("never serves or joins another account's request", async () => {
    const first = deferred<string>();
    const a = reusePassageResource('7', 'k', () => first.promise);
    const other = jest.fn().mockResolvedValue('theirs');
    await expect(reusePassageResource('8', 'k', other)).resolves.toBe('theirs');
    first.resolve('mine');
    await expect(a).resolves.toBe('mine');
    expect(other).toHaveBeenCalledTimes(1);
    await expect(
      reusePassageResource('8', 'k', jest.fn().mockResolvedValue('x')),
    ).resolves.toBe('theirs');
  });

  it('asks again after a failure', async () => {
    const fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('502'))
      .mockResolvedValueOnce('ok');
    await expect(reusePassageResource('7', 'k', fetch)).rejects.toThrow('502');
    await expect(reusePassageResource('7', 'k', fetch)).resolves.toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('refetches for an explicit refresh, and keeps the newer answer', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce('old')
      .mockResolvedValueOnce('new');
    await reusePassageResource('7', 'k', fetch);
    await expect(
      reusePassageResource('7', 'k', fetch, { fresh: true }),
    ).resolves.toBe('new');
    await expect(reusePassageResource('7', 'k', fetch)).resolves.toBe('new');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not let an older request overwrite a refresh that started later', async () => {
    const slow = deferred<string>();
    const old = reusePassageResource('7', 'k', () => slow.promise);
    await reusePassageResource('7', 'k', async () => 'new', { fresh: true });
    slow.resolve('old');
    await old;
    await expect(
      reusePassageResource('7', 'k', jest.fn().mockResolvedValue('x')),
    ).resolves.toBe('new');
  });

  it('refetches once the answer is older than the TTL', async () => {
    jest.useFakeTimers({ now: 1_000_000 });
    const fetch = jest.fn().mockResolvedValueOnce('a').mockResolvedValue('b');
    await reusePassageResource('7', 'k', fetch);
    jest.setSystemTime(1_000_000 + PASSAGE_RESOURCE_REUSE_TTL_MS - 1);
    await expect(reusePassageResource('7', 'k', fetch)).resolves.toBe('a');
    jest.setSystemTime(1_000_000 + PASSAGE_RESOURCE_REUSE_TTL_MS);
    await expect(reusePassageResource('7', 'k', fetch)).resolves.toBe('b');
  });

  it('refetches when the answer is no longer valid (e.g. an expired URL)', async () => {
    const fetch = jest.fn().mockResolvedValueOnce('a').mockResolvedValue('b');
    const isValid = (v: string) => v !== 'a';
    await reusePassageResource('7', 'k', fetch, { isValid });
    await expect(
      reusePassageResource('7', 'k', fetch, { isValid }),
    ).resolves.toBe('b');
  });

  it("drops one account's answers, and a request in flight across a clear isn't kept", async () => {
    const pending = deferred<string>();
    await reusePassageResource('7', 'a', async () => 'seven');
    await reusePassageResource('8', 'a', async () => 'eight');
    const inFlight = reusePassageResource('7', 'b', () => pending.promise);

    clearPassageResourceReuse('7');
    pending.resolve('late');
    await inFlight;

    const again = jest.fn().mockResolvedValue('fresh');
    await expect(reusePassageResource('7', 'a', again)).resolves.toBe('fresh');
    await expect(reusePassageResource('7', 'b', again)).resolves.toBe('fresh');
    await expect(
      reusePassageResource('8', 'a', jest.fn().mockResolvedValue('x')),
    ).resolves.toBe('eight');

    clearPassageResourceReuse();
    await expect(
      reusePassageResource('8', 'a', jest.fn().mockResolvedValue('x')),
    ).resolves.toBe('x');
  });
});

describe('reusePassageResource server-error hold', () => {
  beforeEach(() => {
    clearPassageResourceReuse();
    jest.useFakeTimers({ now: 5_000_000 });
  });
  afterEach(() => jest.useRealTimers());

  it('rethrows a recent 5xx instead of asking again, until the hold ends', async () => {
    const fetch = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(502, 'upstream'))
      .mockResolvedValue('ok');
    await expect(reusePassageResource('7', 'k', fetch)).rejects.toThrow(
      'upstream',
    );
    jest.setSystemTime(5_000_000 + PASSAGE_RESOURCE_FAILURE_HOLD_MS - 1);
    await expect(reusePassageResource('7', 'k', fetch)).rejects.toThrow(
      'upstream',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    jest.setSystemTime(5_000_000 + PASSAGE_RESOURCE_FAILURE_HOLD_MS);
    await expect(reusePassageResource('7', 'k', fetch)).resolves.toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('asks again at once for an explicit retry, another account, or a clear', async () => {
    const fetch = jest.fn().mockRejectedValue(new ApiError(503, 'down'));
    await expect(reusePassageResource('7', 'k', fetch)).rejects.toThrow();
    await expect(
      reusePassageResource('7', 'k', fetch, { fresh: true }),
    ).rejects.toThrow();
    await expect(reusePassageResource('8', 'k', fetch)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(3);
    clearPassageResourceReuse('7');
    await expect(reusePassageResource('7', 'k', fetch)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('does not hold network failures or client errors', async () => {
    const fetch = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(0, 'network'))
      .mockRejectedValueOnce(new ApiError(403, 'forbidden'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('ok');
    for (let i = 0; i < 3; i += 1) {
      await expect(reusePassageResource('7', 'k', fetch)).rejects.toThrow();
    }
    await expect(reusePassageResource('7', 'k', fetch)).resolves.toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
