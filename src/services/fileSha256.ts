import { requireOptionalNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
import { File, FileMode } from 'expo-file-system';

/** Bytes per native read; bounds memory regardless of file length. */
export const FILE_HASH_READ_BYTES = 256 * 1024;
/** Bytes hashed between abort checks / yield opportunities. */
const HASH_SLICE_BYTES = 64 * 1024;
/** Longest stretch of hashing before the JS thread is handed back. */
const YIELD_AFTER_MS = 12;

export function isSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

const K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/**
 * Streaming SHA-256 (FIPS 180-4). The compression loop is written out with
 * locals only: Hermes interprets bytecode, and helper calls per round cost
 * more than the arithmetic. Verified against Node's crypto in tests.
 */
export class Sha256 {
  private readonly state = new Int32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  private readonly w = new Int32Array(64);
  private readonly pending = new Uint8Array(64);
  private pendingLength = 0;
  private totalBytes = 0;
  private finished = false;

  update(bytes: Uint8Array): this {
    if (this.finished) throw new Error('SHA-256 already finished');
    this.totalBytes += bytes.length;
    let offset = 0;
    if (this.pendingLength > 0) {
      const take = Math.min(64 - this.pendingLength, bytes.length);
      this.pending.set(bytes.subarray(0, take), this.pendingLength);
      this.pendingLength += take;
      offset = take;
      if (this.pendingLength < 64) return this;
      this.compress(this.pending, 0, 64);
      this.pendingLength = 0;
    }
    const whole = offset + ((bytes.length - offset) & ~63);
    if (whole > offset) this.compress(bytes, offset, whole);
    if (whole < bytes.length) {
      this.pending.set(bytes.subarray(whole));
      this.pendingLength = bytes.length - whole;
    }
    return this;
  }

  digestHex(): string {
    if (this.finished) throw new Error('SHA-256 already finished');
    this.finished = true;
    const tail = new Uint8Array(this.pendingLength + 9 > 64 ? 128 : 64);
    tail.set(this.pending.subarray(0, this.pendingLength));
    tail[this.pendingLength] = 0x80;
    const bits = this.totalBytes * 8;
    const view = new DataView(tail.buffer);
    view.setUint32(tail.length - 8, Math.floor(bits / 0x100000000));
    view.setUint32(tail.length - 4, bits >>> 0);
    this.compress(tail, 0, tail.length);
    let out = '';
    for (let i = 0; i < 8; i += 1) {
      out += (this.state[i] >>> 0).toString(16).padStart(8, '0');
    }
    return out;
  }

  private compress(b: Uint8Array, start: number, end: number): void {
    const H = this.state;
    const W = this.w;
    let h0 = H[0];
    let h1 = H[1];
    let h2 = H[2];
    let h3 = H[3];
    let h4 = H[4];
    let h5 = H[5];
    let h6 = H[6];
    let h7 = H[7];
    for (let off = start; off < end; off += 64) {
      for (let i = 0; i < 16; i += 1) {
        const j = off + i * 4;
        W[i] = (b[j] << 24) | (b[j + 1] << 16) | (b[j + 2] << 8) | b[j + 3];
      }
      for (let i = 16; i < 64; i += 1) {
        const x = W[i - 15];
        const y = W[i - 2];
        W[i] =
          ((((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) +
            W[i - 7] +
            (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)) +
            W[i - 16]) |
          0;
      }
      let a = h0;
      let bb = h1;
      let c = h2;
      let d = h3;
      let e = h4;
      let f = h5;
      let g = h6;
      let h = h7;
      for (let i = 0; i < 64; i += 1) {
        const t1 =
          (h +
            (((e >>> 6) | (e << 26)) ^
              ((e >>> 11) | (e << 21)) ^
              ((e >>> 25) | (e << 7))) +
            ((e & f) ^ (~e & g)) +
            K[i] +
            W[i]) |
          0;
        const t2 =
          ((((a >>> 2) | (a << 30)) ^
            ((a >>> 13) | (a << 19)) ^
            ((a >>> 22) | (a << 10))) +
            ((a & bb) ^ (a & c) ^ (bb & c))) |
          0;
        h = g;
        g = f;
        f = e;
        e = (d + t1) | 0;
        d = c;
        c = bb;
        bb = a;
        a = (t1 + t2) | 0;
      }
      h0 = (h0 + a) | 0;
      h1 = (h1 + bb) | 0;
      h2 = (h2 + c) | 0;
      h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0;
      h5 = (h5 + f) | 0;
      h6 = (h6 + g) | 0;
      h7 = (h7 + h) | 0;
    }
    H[0] = h0;
    H[1] = h1;
    H[2] = h2;
    H[3] = h3;
    H[4] = h4;
    H[5] = h5;
    H[6] = h6;
    H[7] = h7;
  }
}

const yieldToUi = () => new Promise<void>(resolve => setTimeout(resolve, 0));

const ABORT_MESSAGE = 'File validation aborted';
const MISSING_MESSAGE = 'Audio file is missing';
const CHANGED_MESSAGE = 'Audio file changed or was truncated during validation';
/** How often a `shouldAbort` callback is polled while native hashing runs. */
const NATIVE_ABORT_POLL_MS = 50;

function abortError(): Error {
  const error = new Error(ABORT_MESSAGE);
  error.name = 'AbortError';
  return error;
}

type FileSha256NativeModule = {
  sha256File(uri: string, size: number, jobId: string): Promise<string>;
  cancel(jobId: string): void;
};

/**
 * Optional binding to the local `FileSha256` Expo module (Android
 * MessageDigest). `null` when it is not linked (Jest, a JS-only bundle that
 * was not prebuilt with `modules/file-sha256`); callers use the JS hasher.
 */
function getNativeFileSha256(): FileSha256NativeModule | null {
  try {
    const native =
      requireOptionalNativeModule<FileSha256NativeModule>('FileSha256');
    return typeof native?.sha256File === 'function' &&
      typeof native.cancel === 'function'
      ? native
      : null;
  } catch {
    return null;
  }
}

let nativeJobCounter = 0;

async function nativeSha256File(
  native: FileSha256NativeModule,
  uri: string,
  size: number,
  isAborted: () => boolean,
  signal: AbortSignal | undefined,
): Promise<string> {
  nativeJobCounter += 1;
  const jobId = `sha256-${nativeJobCounter}`;
  const cancel = () => {
    try {
      native.cancel(jobId);
    } catch {
      // The job may already have finished.
    }
  };
  signal?.addEventListener('abort', cancel);
  const poll = setInterval(() => {
    if (isAborted()) cancel();
  }, NATIVE_ABORT_POLL_MS);
  try {
    return await native.sha256File(uri, size, jobId);
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === 'ERR_HASH_ABORTED') throw abortError();
    if (code === 'ERR_FILE_MISSING') throw new Error(MISSING_MESSAGE);
    if (code === 'ERR_FILE_CHANGED') throw new Error(CHANGED_MESSAGE);
    throw error;
  } finally {
    clearInterval(poll);
    signal?.removeEventListener('abort', cancel);
  }
}

/**
 * SHA-256 of a local file in bounded reads, without materializing it. Raw
 * bytes come straight from a native file handle (no Base64 round trip).
 */
export async function sha256File(
  uri: string,
  options: {
    size?: number;
    signal?: AbortSignal;
    shouldAbort?: () => boolean;
  } = {},
): Promise<string> {
  const isAborted = (): boolean =>
    Boolean(options.signal?.aborted || options.shouldAbort?.());
  const checkAbort = (): void => {
    if (isAborted()) throw abortError();
  };
  checkAbort();
  let size = options.size;
  if (size === undefined) {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory) throw new Error(MISSING_MESSAGE);
    size = info.size;
  }
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error('Cannot determine audio file size');
  }
  checkAbort();
  const native = uri.startsWith('file://') ? getNativeFileSha256() : null;
  if (native) {
    const digest = await nativeSha256File(
      native,
      uri,
      size,
      isAborted,
      options.signal,
    );
    checkAbort();
    return digest;
  }
  const hash = new Sha256();
  let handle: ReturnType<File['open']>;
  try {
    handle = new File(uri).open(FileMode.ReadOnly);
  } catch {
    throw new Error(MISSING_MESSAGE);
  }
  try {
    let sliceStarted = Date.now();
    for (let position = 0; position < size; ) {
      checkAbort();
      const length = Math.min(FILE_HASH_READ_BYTES, size - position);
      const bytes = handle.readBytes(length);
      if (bytes.length !== length) {
        throw new Error(CHANGED_MESSAGE);
      }
      for (let at = 0; at < length; at += HASH_SLICE_BYTES) {
        hash.update(
          bytes.subarray(at, Math.min(length, at + HASH_SLICE_BYTES)),
        );
        if (Date.now() - sliceStarted >= YIELD_AFTER_MS) {
          await yieldToUi();
          checkAbort();
          sliceStarted = Date.now();
        }
      }
      position += length;
    }
    const extra = handle.readBytes(1);
    if (extra.length !== 0) {
      throw new Error(CHANGED_MESSAGE);
    }
  } finally {
    try {
      handle.close();
    } catch {
      // A failed close must not hide a hash or cancellation error.
    }
  }
  checkAbort();
  return hash.digestHex();
}
