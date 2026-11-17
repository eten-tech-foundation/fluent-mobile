import { act, renderHook, waitFor } from '@testing-library/react-native';
import { FluentAPI } from '../../../../services/api';
import { findDownloadedRows } from '../../../../services/offlineResources';
import type { ApiTranslationImageItem } from '../../../../types/api/translationResources';
import type { DownloadQueueItem } from '../../../../types/download/types';
import type { ResourceSectionId } from '../../../../types/resources/types';
import { usePassageImages, type PassageImagesState } from './usePassageImages';
import type { Ready } from './ready';

let mockConnectivity = { isOnline: true, hasResolved: true };
let mockDownloadedSections: ResourceSectionId[] = [];

jest.mock('../../../../hooks/useConnectivity', () => ({
  useConnectivity: () => mockConnectivity,
}));

jest.mock('../../../../hooks/useResourcesInventory', () => ({
  useResourcesInventory: () => ({
    inventoryVersion: 0,
    downloadedSections: mockDownloadedSections,
    getResourceStatus: () => 'available',
  }),
}));

jest.mock('../../../../services/api', () => ({
  FluentAPI: { getTranslationImages: jest.fn() },
}));

jest.mock('../../../../services/offlineResources', () => ({
  findDownloadedRows: jest.fn(),
}));

const getImages = FluentAPI.getTranslationImages as jest.MockedFunction<
  typeof FluentAPI.getTranslationImages
>;
const mockFindRows = findDownloadedRows as jest.MockedFunction<
  typeof findDownloadedRows
>;

function item(id: number, title: string): ApiTranslationImageItem {
  return {
    id,
    title,
    localizedName: title,
    url: `https://example.org/${id}.jpg`,
    thumbnailUrl: `https://example.org/${id}-thumb.jpg`,
    caption: `Caption ${id}`,
    attribution: `Credit ${id}`,
  };
}

function response(...items: ApiTranslationImageItem[]) {
  return { items } as Awaited<
    ReturnType<typeof FluentAPI.getTranslationImages>
  >;
}

function passage(
  verses: { chapterNumber: number; verseNumber: number }[],
  overrides: Partial<Ready['assignment']> = {},
): Ready {
  return {
    assignment: {
      projectId: 7,
      bookCode: 'MRK',
      chapterNumber: 14,
      sourceLanguageCode: 'eng',
      ...overrides,
    },
    verses,
  } as unknown as Ready;
}

const PERICOPE = passage([
  { chapterNumber: 14, verseNumber: 1 },
  { chapterNumber: 14, verseNumber: 2 },
]);

type Props = { passage: Ready; userId: number | null; enabled: boolean };

/** Every state rendered, so a stale one can't hide between renders. */
function renderImages(initial: Partial<Props> = {}) {
  const seen: PassageImagesState[] = [];
  const view = renderHook(
    (props: Props) => {
      const result = usePassageImages(props);
      seen.push(result.state);
      return result;
    },
    {
      initialProps: {
        passage: PERICOPE,
        userId: 5,
        enabled: true,
        ...initial,
      },
    },
  );
  return { ...view, seen };
}

function titles(state: PassageImagesState) {
  return state.status === 'ready' ? state.items.map(i => i.title) : [];
}

describe('usePassageImages', () => {
  beforeEach(() => {
    mockConnectivity = { isOnline: true, hasResolved: true };
    mockDownloadedSections = [];
    getImages.mockReset();
    mockFindRows.mockReset();
    mockFindRows.mockResolvedValue(null);
  });

  it('stays loading without asking anything while connectivity is unresolved', async () => {
    mockConnectivity = { isOnline: false, hasResolved: false };
    const { result } = renderImages();
    await act(async () => {});
    expect(result.current.state).toEqual({ status: 'loading' });
    expect(mockFindRows).not.toHaveBeenCalled();
    expect(getImages).not.toHaveBeenCalled();
  });

  it('does not load until asked', async () => {
    const { result, rerender } = renderImages({ enabled: false });
    await act(async () => {});
    expect(result.current.state).toEqual({ status: 'loading' });
    expect(getImages).not.toHaveBeenCalled();

    getImages.mockResolvedValue(response(item(1, 'Jerusalem')));
    rerender({ passage: PERICOPE, userId: 5, enabled: true });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
  });

  it('asks for every verse in a pericope, keeping order, metadata and no duplicates', async () => {
    getImages.mockImplementation(async (_p, _b, _c, verse) =>
      verse === 1
        ? response(item(1, 'Jerusalem'))
        : response(item(1, 'Jerusalem'), item(2, 'Upper room')),
    );
    const { result } = renderImages();
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(getImages.mock.calls).toEqual([
      [7, 'MRK', 14, 1, 'eng'],
      [7, 'MRK', 14, 2, 'eng'],
    ]);
    expect(result.current.state).toEqual({
      status: 'ready',
      items: [
        {
          id: 'img-api-1',
          title: 'Jerusalem',
          caption: 'Caption 1',
          attribution: 'Credit 1',
          uri: 'https://example.org/1.jpg',
          thumbnailUri: 'https://example.org/1-thumb.jpg',
        },
        {
          id: 'img-api-2',
          title: 'Upper room',
          caption: 'Caption 2',
          attribution: 'Credit 2',
          uri: 'https://example.org/2.jpg',
          thumbnailUri: 'https://example.org/2-thumb.jpg',
        },
      ],
    });
  });

  it('keeps each chapter of a cross-chapter passage with its own verses', async () => {
    getImages.mockResolvedValue(response());
    const { result } = renderImages({
      passage: passage([
        { chapterNumber: 14, verseNumber: 72 },
        { chapterNumber: 15, verseNumber: 1 },
      ]),
    });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(getImages.mock.calls).toEqual([
      [7, 'MRK', 14, 72, 'eng'],
      [7, 'MRK', 15, 1, 'eng'],
    ]);
  });

  it('reads prepared images offline from the chapter download with no API call', async () => {
    mockConnectivity = { isOnline: false, hasResolved: true };
    mockDownloadedSections = ['imagesMaps'];
    mockFindRows.mockResolvedValue([
      {
        id: 'row-1',
        label: 'Jerusalem',
        localFilePath: 'file:///images/1.jpg',
      } as DownloadQueueItem,
    ]);
    const { result } = renderImages();
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(titles(result.current.state)).toEqual(['Jerusalem']);
    const [lookup] = mockFindRows.mock.calls[0];
    expect(lookup).toMatchObject({
      resourceName: 'Reference Images',
      kind: 'image',
      chapterNumber: 14,
    });
    // Downloaded images are chapter-level, so no verse narrows them.
    expect(lookup).not.toHaveProperty('verseNumber');
    expect(getImages).not.toHaveBeenCalled();
  });

  it('never reads offline-with-none as confirmed empty', async () => {
    mockConnectivity = { isOnline: false, hasResolved: true };
    const { result, rerender } = renderImages();
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'unprepared' }),
    );

    // Something in the project is downloaded, but downloads are per chapter.
    mockDownloadedSections = ['imagesMaps'];
    rerender({ passage: PERICOPE, userId: 5, enabled: true });
    expect(result.current.state).toEqual({ status: 'noneOffline' });
    expect(getImages).not.toHaveBeenCalled();
  });

  it('shows empty, not unprepared, after an online load with none', async () => {
    getImages.mockResolvedValue(response());
    const { result } = renderImages();
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'ready', items: [] }),
    );
  });

  it('asks nothing for a whole chapter whose text is not here yet', async () => {
    const { result } = renderImages({ passage: passage([]) });
    await act(async () => {});
    expect(result.current.state).toEqual({ status: 'noVerses' });
    expect(mockFindRows).not.toHaveBeenCalled();
    expect(getImages).not.toHaveBeenCalled();
  });

  it('fails as one state and Retry recovers it', async () => {
    getImages.mockRejectedValue(new Error('down'));
    const { result } = renderImages();
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'failed' }),
    );

    getImages.mockReset();
    getImages.mockResolvedValue(response(item(1, 'Jerusalem')));
    await act(async () => {
      await result.current.retry();
    });
    expect(titles(result.current.state)).toEqual(['Jerusalem']);
  });

  it.each([
    ['account', { userId: 6 }],
    ['project', { passage: passage(PERICOPE.verses, { projectId: 8 }) }],
    [
      'language',
      { passage: passage(PERICOPE.verses, { sourceLanguageCode: 'spa' }) },
    ],
    ['passage', { passage: passage([{ chapterNumber: 14, verseNumber: 3 }]) }],
  ])(
    'never shows the previous images after a %s switch, even when the old response lands late',
    async (_name, change) => {
      let finishOld: (value: ReturnType<typeof response>) => void = () => {};
      const old = new Promise<ReturnType<typeof response>>(resolve => {
        finishOld = resolve;
      });
      getImages.mockImplementation(() => old);
      const { rerender, seen } = renderImages();
      await waitFor(() => expect(getImages).toHaveBeenCalledTimes(2));

      getImages.mockImplementation(() => new Promise(() => {}));
      rerender({ passage: PERICOPE, userId: 5, enabled: true, ...change });
      await act(async () => {
        finishOld(response(item(1, 'Old image')));
      });
      expect(seen.flatMap(titles)).not.toContain('Old image');
    },
  );

  it.each([
    ['account', { userId: 6 }],
    ['project', { passage: passage(PERICOPE.verses, { projectId: 8 }) }],
    [
      'language',
      { passage: passage(PERICOPE.verses, { sourceLanguageCode: 'spa' }) },
    ],
    ['book', { passage: passage(PERICOPE.verses, { bookCode: 'LUK' }) }],
    ['verses', { passage: passage([{ chapterNumber: 14, verseNumber: 3 }]) }],
  ])('changes its scope with the %s', (_name, change) => {
    const { result, rerender } = renderImages({ enabled: false });
    const first = result.current.scope;
    rerender({ passage: PERICOPE, userId: 5, enabled: false, ...change });
    expect(result.current.scope).not.toBe(first);
  });
});
