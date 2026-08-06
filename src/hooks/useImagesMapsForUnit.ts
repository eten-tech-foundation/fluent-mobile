import { useCallback, useEffect, useRef, useState } from 'react';
import { loadImagesMapsForUnit } from '../mocks/resources/imagesMapsMock';
import { ImagesMapsItem } from '../types/resources/imagesMaps';
import { logger } from '../utils/logger';

const log = logger.create('useImagesMapsForUnit');

export type ImagesMapsLoadState =
  | { status: 'loading' }
  | { status: 'ready'; items: ImagesMapsItem[] }
  | { status: 'error'; message: string };

/**
 * Section-scoped Images & Maps loader (#191). Failures stay local.
 * Ignores stale responses when the active unit changes mid-load.
 */
export function useImagesMapsForUnit(chapterId: number, verseNumber: number) {
  const [state, setState] = useState<ImagesMapsLoadState>({
    status: 'loading',
  });
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setState({ status: 'loading' });
    try {
      const items = await loadImagesMapsForUnit(chapterId, verseNumber);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setState({ status: 'ready', items });
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      log.warn('Images & Maps load failed', {
        chapterId,
        verseNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      setState({
        status: 'error',
        message: 'Unable to load Images & Maps.',
      });
    }
  }, [chapterId, verseNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    state,
    retry: load,
  };
}
