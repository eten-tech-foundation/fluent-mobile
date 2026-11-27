import { File } from 'expo-file-system';
import { __setMockFileBytes } from '../test/mocks/expo-file-system';
import { concatAdtsSegments } from './concatAdtsSegments';

describe('concatAdtsSegments', () => {
  it('refuses an empty recording', async () => {
    await expect(concatAdtsSegments([], 'file:///out.aac')).rejects.toThrow(
      'Cannot concatenate an empty recording',
    );
  });

  it('returns a lone segment untouched', async () => {
    await expect(
      concatAdtsSegments(['file:///a.aac'], 'file:///out.aac'),
    ).resolves.toBe('file:///a.aac');
  });

  it('has written the joined bytes by the time it returns the output URI', async () => {
    __setMockFileBytes('file:///a.aac', Uint8Array.from([1, 2, 3]));
    __setMockFileBytes('file:///b.aac', Uint8Array.from([4, 5]));

    const uri = await concatAdtsSegments(
      ['file:///a.aac', 'file:///b.aac'],
      'file:///out.aac',
    );

    expect(uri).toBe('file:///out.aac');
    expect(Array.from(await new File(uri).bytes())).toEqual([1, 2, 3, 4, 5]);
  });
});
