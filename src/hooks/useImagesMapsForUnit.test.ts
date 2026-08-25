import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useImagesMapsForUnit } from './useImagesMapsForUnit';
import {
  loadImagesMapsForUnit,
  setImagesMapsLoadFailureForTests,
} from '../services/imagesMaps';
import { IMAGES_MAPS_LOAD_ERROR } from '../constants/messages';
import { getMockImagesMaps } from '../mocks/resources/imagesMapsMock';

jest.mock('../services/imagesMaps', () => {
  const actual = jest.requireActual('../services/imagesMaps');
  return {
    ...actual,
    loadImagesMapsForUnit: jest.fn(),
  };
});

const mockLoad = loadImagesMapsForUnit as jest.MockedFunction<
  typeof loadImagesMapsForUnit
>;

describe('useImagesMapsForUnit', () => {
  afterEach(() => {
    setImagesMapsLoadFailureForTests(false);
    mockLoad.mockReset();
  });

  it('loads items for units that have Images & Maps', async () => {
    mockLoad.mockResolvedValue(getMockImagesMaps(10, 2));

    const { result } = renderHook(() =>
      useImagesMapsForUnit({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 1,
        verseNumber: 2,
      }),
    );

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    if (result.current.state.status !== 'ready') {
      throw new Error('expected ready state');
    }
    expect(result.current.state.items.length).toBeGreaterThan(0);
    expect(mockLoad).toHaveBeenCalledWith({
      projectId: 7,
      bookCode: 'MRK',
      chapterNumber: 1,
      verseNumber: 2,
      languageCode: undefined,
    });
  });

  it('exposes an error state that retry can clear', async () => {
    mockLoad.mockRejectedValueOnce(new Error('boom'));
    mockLoad.mockResolvedValueOnce(getMockImagesMaps(10, 2));

    const { result } = renderHook(() =>
      useImagesMapsForUnit({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 1,
        verseNumber: 2,
      }),
    );

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    if (result.current.state.status !== 'error') {
      throw new Error('expected error state');
    }
    expect(result.current.state.message).toBe(IMAGES_MAPS_LOAD_ERROR);

    await act(async () => {
      await result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
  });

  it('does not show the previous unit while the next load is still pending', async () => {
    mockLoad.mockResolvedValue(getMockImagesMaps(10, 2));

    const { result, rerender } = renderHook(
      ({
        projectId,
        bookCode,
        chapterNumber,
        verseNumber,
      }: {
        projectId: number | null;
        bookCode: string;
        chapterNumber: number;
        verseNumber: number;
      }) =>
        useImagesMapsForUnit({
          projectId,
          bookCode,
          chapterNumber,
          verseNumber,
        }),
      {
        initialProps: {
          projectId: 7,
          bookCode: 'MRK',
          chapterNumber: 1,
          verseNumber: 2,
        },
      },
    );

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    if (result.current.state.status !== 'ready') {
      throw new Error('expected ready state');
    }
    expect(result.current.state.items.length).toBeGreaterThan(0);

    let resolveNextLoad!: (
      items: Awaited<ReturnType<typeof loadImagesMapsForUnit>>,
    ) => void;
    const pendingLoad = new Promise<
      Awaited<ReturnType<typeof loadImagesMapsForUnit>>
    >(resolve => {
      resolveNextLoad = resolve;
    });
    mockLoad.mockReturnValueOnce(pendingLoad);

    rerender({
      projectId: 7,
      bookCode: 'MRK',
      chapterNumber: 1,
      verseNumber: 1,
    });

    expect(result.current.state.status).toBe('loading');

    await act(async () => {
      resolveNextLoad([]);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    if (result.current.state.status !== 'ready') {
      throw new Error('expected ready state');
    }
    expect(result.current.state.items).toEqual([]);
  });
});
