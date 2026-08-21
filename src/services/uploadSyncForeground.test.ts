import { getUploadSyncForegroundModule } from './uploadSyncForeground';

const mockRequireOptional = jest.fn();

jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => mockRequireOptional(name),
}));

describe('getUploadSyncForegroundModule', () => {
  beforeEach(() => {
    mockRequireOptional.mockReset();
  });

  it('returns null when the native module is unavailable', () => {
    mockRequireOptional.mockReturnValue(null);
    expect(getUploadSyncForegroundModule()).toBeNull();
    expect(mockRequireOptional).toHaveBeenCalledWith('UploadSyncForeground');
  });

  it('returns the native start/update/stop surface when linked', async () => {
    const start = jest.fn(async () => undefined);
    const update = jest.fn(async () => undefined);
    const stop = jest.fn(async () => undefined);
    mockRequireOptional.mockReturnValue({ start, update, stop });

    const native = getUploadSyncForegroundModule();
    expect(native).not.toBeNull();
    await native!.start(
      'Uploading your recordings',
      '0 of 3 chapters uploaded',
    );
    await native!.update(
      'Uploading your recordings',
      '1 of 3 chapters uploaded',
    );
    await native!.stop();
    expect(start).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('returns null when requireOptionalNativeModule throws', () => {
    mockRequireOptional.mockImplementation(() => {
      throw new Error('no native runtime');
    });
    expect(getUploadSyncForegroundModule()).toBeNull();
  });
});
