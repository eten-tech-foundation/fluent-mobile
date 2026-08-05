import { getRemuxNativeModule } from './aacRemux';

const mockRequireOptional = jest.fn();

jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => mockRequireOptional(name),
}));

describe('getRemuxNativeModule', () => {
  beforeEach(() => {
    mockRequireOptional.mockReset();
  });

  it('returns null when the native module is unavailable', () => {
    mockRequireOptional.mockReturnValue(null);
    expect(getRemuxNativeModule()).toBeNull();
    expect(mockRequireOptional).toHaveBeenCalledWith('AacRemux');
  });

  it('returns a RemuxNativeModule when remuxAacToM4a is present', async () => {
    const remuxAacToM4a = jest.fn(async (_in: string, out: string) => out);
    mockRequireOptional.mockReturnValue({ remuxAacToM4a });

    const remux = getRemuxNativeModule();
    expect(remux).not.toBeNull();
    await expect(
      remux!.remuxAacToM4a('file:///a.aac', 'file:///a.m4a'),
    ).resolves.toBe('file:///a.m4a');
    expect(remuxAacToM4a).toHaveBeenCalledWith(
      'file:///a.aac',
      'file:///a.m4a',
    );
  });

  it('returns null when requireOptionalNativeModule throws', () => {
    mockRequireOptional.mockImplementation(() => {
      throw new Error('no native runtime');
    });
    expect(getRemuxNativeModule()).toBeNull();
  });
});
