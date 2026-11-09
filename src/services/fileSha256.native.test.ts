import { sha256File } from './fileSha256';
import {
  __setMockFileBytes,
  resetFileSystemMock,
} from '../test/mocks/expo-file-system';

const { createHash } = require('node:crypto') as {
  createHash: (name: string) => {
    update: (bytes: Uint8Array) => { digest: (encoding: string) => string };
  };
};

const mockRequireOptional = jest.fn();
jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => mockRequireOptional(name),
}));

type Deferred = {
  resolve: (digest: string) => void;
  reject: (error: unknown) => void;
};

function nativeModule() {
  const pending: Deferred[] = [];
  const module = {
    sha256File: jest.fn(
      (_uri: string, _size: number, _jobId: string) =>
        new Promise<string>((resolve, reject) => {
          pending.push({ resolve, reject });
        }),
    ),
    cancel: jest.fn((_jobId: string) => {
      pending
        .shift()
        ?.reject(
          Object.assign(new Error('rejected'), { code: 'ERR_HASH_ABORTED' }),
        );
    }),
  };
  return { module, pending };
}

const URI = 'file:///mock-document/recordings/take.m4a';
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

describe('sha256File native path', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetFileSystemMock();
  });

  it('hashes file URIs natively with the expected size', async () => {
    const { module, pending } = nativeModule();
    mockRequireOptional.mockReturnValue(module);

    const result = sha256File(URI, { size: 4096 });
    await flush();
    expect(module.sha256File).toHaveBeenCalledWith(
      URI,
      4096,
      expect.stringMatching(/^sha256-/),
    );
    pending[0]?.resolve('ab'.repeat(32));
    await expect(result).resolves.toBe('ab'.repeat(32));
    expect(mockRequireOptional).toHaveBeenCalledWith('FileSha256');
  });

  it.each([
    ['ERR_FILE_MISSING', 'Audio file is missing'],
    [
      'ERR_FILE_CHANGED',
      'Audio file changed or was truncated during validation',
    ],
  ])('maps native %s to the JS hasher message', async (code, message) => {
    const { module, pending } = nativeModule();
    mockRequireOptional.mockReturnValue(module);

    const result = sha256File(URI, { size: 10 });
    await flush();
    pending[0]?.reject(Object.assign(new Error('native'), { code }));
    await expect(result).rejects.toThrow(message);
  });

  it('passes other native failures through', async () => {
    const { module, pending } = nativeModule();
    mockRequireOptional.mockReturnValue(module);

    const result = sha256File(URI, { size: 10 });
    await flush();
    pending[0]?.reject(new Error('I/O error'));
    await expect(result).rejects.toThrow('I/O error');
  });

  it('cancels the native job when the signal aborts', async () => {
    const { module } = nativeModule();
    mockRequireOptional.mockReturnValue(module);
    const controller = new AbortController();

    const result = sha256File(URI, { size: 10, signal: controller.signal });
    await flush();
    controller.abort();
    await expect(result).rejects.toMatchObject({
      name: 'AbortError',
      message: 'File validation aborted',
    });
    expect(module.cancel).toHaveBeenCalledWith(
      module.sha256File.mock.calls[0]?.[2],
    );
  });

  it('polls shouldAbort while the native job runs', async () => {
    const { module } = nativeModule();
    mockRequireOptional.mockReturnValue(module);
    let abort = false;

    const result = sha256File(URI, { size: 10, shouldAbort: () => abort });
    await flush();
    abort = true;
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(module.cancel).toHaveBeenCalledTimes(1);
  });

  it('reports an abort that lands after the native digest', async () => {
    const { module, pending } = nativeModule();
    mockRequireOptional.mockReturnValue(module);
    let abort = false;

    const result = sha256File(URI, { size: 10, shouldAbort: () => abort });
    await flush();
    abort = true;
    pending[0]?.resolve('cd'.repeat(32));
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not start native work when already aborted', async () => {
    const { module } = nativeModule();
    mockRequireOptional.mockReturnValue(module);

    await expect(
      sha256File(URI, { size: 10, shouldAbort: () => true }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(module.sha256File).not.toHaveBeenCalled();
  });

  it('does not start native work when aborted after the size is known', async () => {
    const { module } = nativeModule();
    mockRequireOptional.mockReturnValue(module);
    let checks = 0;

    await expect(
      sha256File(URI, { size: 10, shouldAbort: () => (checks += 1) > 1 }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(module.sha256File).not.toHaveBeenCalled();
  });

  it.each([
    ['the module is not linked', null],
    ['the module throws on load', 'throw'],
  ])('falls back to the JS hasher when %s', async (_label, mode) => {
    if (mode === 'throw') {
      mockRequireOptional.mockImplementation(() => {
        throw new Error('not linked');
      });
    } else {
      mockRequireOptional.mockReturnValue(null);
    }
    const bytes = Uint8Array.from({ length: 1000 }, (_, i) => (i * 7) & 0xff);
    __setMockFileBytes(URI, bytes);

    await expect(sha256File(URI, { size: bytes.length })).resolves.toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
  });

  it('uses the JS hasher for non-file URIs', async () => {
    const { module } = nativeModule();
    mockRequireOptional.mockReturnValue(module);
    const uri = 'content://media/take';
    const bytes = Uint8Array.from([1, 2, 3]);
    __setMockFileBytes(uri, bytes);

    await expect(sha256File(uri, { size: bytes.length })).resolves.toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    expect(module.sha256File).not.toHaveBeenCalled();
  });
});
