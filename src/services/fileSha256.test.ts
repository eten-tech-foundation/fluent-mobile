import * as ExpoFileSystem from 'expo-file-system';
import type { FileHandle } from 'expo-file-system';
import { FILE_HASH_READ_BYTES, Sha256, sha256File } from './fileSha256';

const { File } = ExpoFileSystem;
/** Present on the Jest file-system mock; absent from the SDK types. */
const mockFiles = ExpoFileSystem as typeof ExpoFileSystem & {
  __setMockFileBytes(uri: string, bytes: Uint8Array): void;
  __getOpenFileHandleCount(): number;
};
const { __setMockFileBytes, __getOpenFileHandleCount } = mockFiles;

const { createHash, randomBytes } = require('node:crypto') as {
  createHash: (name: string) => {
    update: (bytes: Uint8Array) => { digest: (encoding: string) => string };
  };
  randomBytes: (size: number) => Uint8Array;
};

const reference = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const ascii = (value: string) => Uint8Array.from(value, ch => ch.charCodeAt(0));

describe('Sha256', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
  ])('matches the FIPS 180-4 vector for %j', (message, digest) => {
    expect(new Sha256().update(ascii(message)).digestHex()).toBe(digest);
  });

  it('matches one million "a"', () => {
    expect(
      new Sha256().update(new Uint8Array(1_000_000).fill(0x61)).digestHex(),
    ).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });

  it('matches node crypto for every length across block and padding edges', () => {
    const bytes = randomBytes(300);
    for (let length = 0; length <= 300; length += 1) {
      const slice = bytes.subarray(0, length);
      expect(new Sha256().update(slice).digestHex()).toBe(reference(slice));
    }
  });

  it('gives the same digest however the input is split', () => {
    const bytes = randomBytes(10_007);
    for (const step of [1, 3, 63, 64, 65, 127, 4096, 10_007]) {
      const hash = new Sha256();
      for (let at = 0; at < bytes.length; at += step) {
        hash.update(bytes.subarray(at, at + step));
      }
      expect(hash.digestHex()).toBe(reference(bytes));
    }
  });

  it('refuses reuse after the digest', () => {
    const hash = new Sha256();
    hash.digestHex();
    expect(() => hash.update(ascii('x'))).toThrow('already finished');
  });
});

describe('sha256File', () => {
  const uri = 'file:///mock-document/take.m4a';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['256 KiB', 256 * 1024],
    ['5 MiB', 5 * 1024 * 1024],
    ['a long recording (30 MiB + 17 bytes)', 30 * 1024 * 1024 + 17],
  ])('hashes %s', async (_label, size) => {
    const bytes = randomBytes(size);
    __setMockFileBytes(uri, bytes);
    await expect(sha256File(uri, { size })).resolves.toBe(reference(bytes));
    expect(__getOpenFileHandleCount()).toBe(0);
  });

  it('never reads more than one bounded chunk at a time', async () => {
    const size = FILE_HASH_READ_BYTES * 3 + 5;
    __setMockFileBytes(uri, randomBytes(size));
    const lengths: number[] = [];
    const realOpen = File.prototype.open;
    const open = jest.spyOn(File.prototype, 'open');
    open.mockImplementation(function (this: File) {
      const handle = realOpen.call(this);
      return {
        ...handle,
        close: () => handle.close(),
        readBytes: (length: number) => {
          lengths.push(length);
          return handle.readBytes(length);
        },
      } as FileHandle;
    });
    await sha256File(uri, { size });
    expect(Math.max(...lengths)).toBeLessThanOrEqual(FILE_HASH_READ_BYTES);
    expect(lengths.at(-1)).toBe(1);
    expect(lengths.reduce((sum, n) => sum + n, 0)).toBe(size + 1);
  });

  it('distinguishes same-size content that changed', async () => {
    const original = randomBytes(4096);
    const changed = Uint8Array.from(original);
    changed[2048] ^= 0x01;
    __setMockFileBytes(uri, original);
    const before = await sha256File(uri, { size: 4096 });
    __setMockFileBytes(uri, changed);
    const after = await sha256File(uri, { size: 4096 });
    expect(after).not.toBe(before);
    expect(after).toBe(reference(changed));
  });

  it('rejects truncation instead of validating a shorter file', async () => {
    __setMockFileBytes(uri, ascii('short'));
    await expect(sha256File(uri, { size: 10 })).rejects.toThrow('truncated');
    expect(__getOpenFileHandleCount()).toBe(0);
  });

  it('stops and closes the handle when cancelled mid-file', async () => {
    const size = FILE_HASH_READ_BYTES * 8;
    __setMockFileBytes(uri, randomBytes(size));
    let clock = 0;
    // Each slice "takes" 20 ms, so the hasher yields after every slice.
    jest.spyOn(Date, 'now').mockImplementation(() => (clock += 20));
    const realOpen = File.prototype.open;
    let bytesRead = 0;
    jest
      .spyOn(File.prototype, 'open')
      .mockImplementation(function (this: File) {
        const handle = realOpen.call(this);
        return {
          ...handle,
          close: () => handle.close(),
          readBytes: (length: number) => {
            bytesRead += length;
            return handle.readBytes(length);
          },
        } as FileHandle;
      });
    let checks = 0;
    await expect(
      sha256File(uri, {
        size,
        shouldAbort: () => {
          checks += 1;
          return checks > 3;
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(bytesRead).toBeLessThan(size);
    expect(__getOpenFileHandleCount()).toBe(0);
  });

  it('honours an abort signal before opening the file', async () => {
    const controller = new AbortController();
    controller.abort();
    const open = jest.spyOn(File.prototype, 'open');
    await expect(
      sha256File(uri, { size: 1, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(open).not.toHaveBeenCalled();
  });
});
