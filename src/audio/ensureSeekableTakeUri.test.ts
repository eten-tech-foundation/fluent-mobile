import { ensureSeekableTakeUri } from './ensureSeekableTakeUri';

describe('ensureSeekableTakeUri', () => {
  it('passes through seekable m4a URIs', async () => {
    await expect(ensureSeekableTakeUri('file:///takes/a.m4a')).resolves.toBe(
      'file:///takes/a.m4a',
    );
  });

  it('remuxes aac when a native module is provided', async () => {
    const remux = {
      remuxAacToM4a: jest.fn(async (_in: string, out: string) => out),
    };
    await expect(
      ensureSeekableTakeUri('file:///takes/a.aac', remux),
    ).resolves.toBe('file:///takes/a.m4a');
    expect(remux.remuxAacToM4a).toHaveBeenCalled();
  });

  it('keeps aac playable when remux is unavailable', async () => {
    await expect(
      ensureSeekableTakeUri('file:///takes/a.aac', null),
    ).resolves.toBe('file:///takes/a.aac');
  });

  it('keeps aac when remux throws', async () => {
    const remux = {
      remuxAacToM4a: jest.fn(async () => {
        throw new Error('muxer failed');
      }),
    };
    await expect(
      ensureSeekableTakeUri('file:///takes/a.aac', remux),
    ).resolves.toBe('file:///takes/a.aac');
  });
});
