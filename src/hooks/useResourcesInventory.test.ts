import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getDownloadedResourceSections } from '../services/resourcesInventory';
import { useResourcesInventory } from './useResourcesInventory';
import { ResourceSectionId } from '../types/resources/types';

jest.mock('../services/resourcesInventory', () => {
  const actual = jest.requireActual('../services/resourcesInventory');
  return {
    ...actual,
    getDownloadedResourceSections: jest.fn(),
    getResourcesInventoryStatus: jest.fn(() => 'available'),
    subscribeResourcesInventory: jest.fn(() => () => undefined),
  };
});

const mockGetDownloaded = getDownloadedResourceSections as jest.MockedFunction<
  typeof getDownloadedResourceSections
>;

describe('useResourcesInventory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes NO_SECTIONS while a pending replacement lookup is in flight', async () => {
    let resolveFirst!: (sections: ResourceSectionId[]) => void;
    let resolveSecond!: (sections: ResourceSectionId[]) => void;

    mockGetDownloaded
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveSecond = resolve;
          }),
      );

    const { result, rerender } = renderHook(
      (props: { projectId: number | null; userId: number | null }) =>
        useResourcesInventory(props.projectId, props.userId),
      { initialProps: { projectId: 1, userId: 10 } },
    );

    expect(result.current.downloadedSections).toEqual([]);

    await act(async () => {
      resolveFirst(['translationNotes']);
    });

    await waitFor(() => {
      expect(result.current.downloadedSections).toEqual(['translationNotes']);
    });

    rerender({ projectId: 1, userId: 20 });

    // Identity change must clear immediately — no prior-account bleed.
    expect(result.current.downloadedSections).toEqual([]);

    await act(async () => {
      resolveSecond(['imagesMaps']);
    });

    await waitFor(() => {
      expect(result.current.downloadedSections).toEqual(['imagesMaps']);
    });

    expect(mockGetDownloaded).toHaveBeenCalledWith(1, 10);
    expect(mockGetDownloaded).toHaveBeenCalledWith(1, 20);
  });

  it('ignores a stale resolution after project replacement', async () => {
    let resolveStale!: (sections: ResourceSectionId[]) => void;

    mockGetDownloaded
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveStale = resolve;
          }),
      )
      .mockResolvedValueOnce(['translationQuestions']);

    const { result, rerender } = renderHook(
      (props: { projectId: number | null; userId: number | null }) =>
        useResourcesInventory(props.projectId, props.userId),
      { initialProps: { projectId: 1, userId: 10 } },
    );

    rerender({ projectId: 2, userId: 10 });

    expect(result.current.downloadedSections).toEqual([]);

    await waitFor(() => {
      expect(result.current.downloadedSections).toEqual([
        'translationQuestions',
      ]);
    });

    await act(async () => {
      resolveStale(['imagesMaps']);
    });

    // Stale first-project result must not overwrite project 2.
    expect(result.current.downloadedSections).toEqual(['translationQuestions']);
  });

  it('clears sections when project or user becomes null', async () => {
    mockGetDownloaded.mockResolvedValue(['translationNotes']);

    const { result, rerender } = renderHook(
      (props: { projectId: number | null; userId: number | null }) =>
        useResourcesInventory(props.projectId, props.userId),
      { initialProps: { projectId: 1, userId: 10 } },
    );

    await waitFor(() => {
      expect(result.current.downloadedSections).toEqual(['translationNotes']);
    });

    rerender({ projectId: null, userId: 10 });
    expect(result.current.downloadedSections).toEqual([]);
  });
});
