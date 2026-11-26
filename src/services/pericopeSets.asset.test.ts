import * as FileSystem from 'expo-file-system/legacy';
import { resetFileSystemMock } from '../test/mocks/expo-file-system';
import {
  __resetBundledPericopeCacheForTests,
  loadBundledPericopeSet,
} from './pericopeSets';

const mockFcbhUri = 'file:///mock-pericope/fcbh.json';
const mockFiaUri = 'file:///mock-pericope/fia.json';
const mockPericopeAsset = {
  omitLocalUri: false,
  presetLocalUri: false,
  downloadCount: 0,
};

jest.mock('../../assets/pericope-sets/FCBH-All-Books.pericope', () => 101);
jest.mock('../../assets/pericope-sets/FIA-All-Books.pericope', () => 202);

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: (id: number) => {
      const localUri = id === 101 ? mockFcbhUri : mockFiaUri;
      const asset = {
        localUri: (mockPericopeAsset.presetLocalUri ? localUri : null) as
          | string
          | null,
        downloadAsync: async () => {
          mockPericopeAsset.downloadCount += 1;
          asset.localUri = mockPericopeAsset.omitLocalUri ? null : localUri;
          return asset;
        },
      };
      return asset;
    },
  },
}));

const fcbhJson = JSON.stringify([
  {
    book: 'Genesis',
    chapter: 1,
    verse: 2,
    fcbh_section: 3,
    fcbh_pericope_number: 4,
  },
  {
    book: 'Genesis',
    chapter: 1,
    verse: 1,
    fcbh_section: 3,
    fcbh_pericope_number: 4,
  },
]);

describe('loadBundledPericopeSet asset read', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockPericopeAsset.omitLocalUri = false;
    mockPericopeAsset.presetLocalUri = false;
    mockPericopeAsset.downloadCount = 0;
    __resetBundledPericopeCacheForTests();
    resetFileSystemMock();
    await FileSystem.writeAsStringAsync(mockFcbhUri, fcbhJson);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads the asset once, then serves the in-memory index', async () => {
    const read = jest.spyOn(FileSystem, 'readAsStringAsync');

    const first = await loadBundledPericopeSet(1, 'GEN');
    const second = await loadBundledPericopeSet(1, 'GEN');

    expect(first).toEqual([
      {
        chapterNumber: 1,
        verseNumber: 1,
        section: 3,
        pericopeNumber: '4',
        pericopeTitle: null,
      },
      {
        chapterNumber: 1,
        verseNumber: 2,
        section: 3,
        pericopeNumber: '4',
        pericopeTitle: null,
      },
    ]);
    expect(second).toEqual(first);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('shares one read between concurrent first calls', async () => {
    const read = jest.spyOn(FileSystem, 'readAsStringAsync');

    const [first, second] = await Promise.all([
      loadBundledPericopeSet(1, 'GEN'),
      loadBundledPericopeSet(1, 'GEN'),
    ]);

    expect(read).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('rejects non-array JSON and retries on the next call', async () => {
    await FileSystem.writeAsStringAsync(mockFcbhUri, '{}');
    await expect(loadBundledPericopeSet(1, 'GEN')).rejects.toThrow(
      'not an array',
    );

    await FileSystem.writeAsStringAsync(mockFcbhUri, fcbhJson);
    await expect(loadBundledPericopeSet(1, 'GEN')).resolves.toHaveLength(2);
  });

  it('rejects when the downloaded asset has no local URI', async () => {
    mockPericopeAsset.omitLocalUri = true;
    await expect(loadBundledPericopeSet(1, 'GEN')).rejects.toThrow(
      'no local URI',
    );
  });

  it('retries a failed asset read on the next call', async () => {
    resetFileSystemMock();
    await expect(loadBundledPericopeSet(1, 'GEN')).rejects.toThrow(
      'File not found',
    );

    await FileSystem.writeAsStringAsync(mockFcbhUri, fcbhJson);
    const verses = await loadBundledPericopeSet(1, 'GEN');
    expect(verses).toHaveLength(2);
  });

  it('does not download an asset that already has a local URI', async () => {
    mockPericopeAsset.presetLocalUri = true;
    const verses = await loadBundledPericopeSet(1, 'GEN');
    expect(verses).toHaveLength(2);
    expect(mockPericopeAsset.downloadCount).toBe(0);
  });

  it('does not read an asset for a set that is not bundled', async () => {
    const read = jest.spyOn(FileSystem, 'readAsStringAsync');
    await expect(loadBundledPericopeSet(999, 'GEN')).resolves.toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
});
