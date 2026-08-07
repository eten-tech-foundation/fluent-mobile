import { getResumableDownloadItems } from '../db/repository';
import { subscribeToConnectivity } from './connectivity';
import { getSharedDownloadQueueWorker } from './downloadQueueWorkerSingleton';
import { logger } from '../utils/logger';

const log = logger.create('downloadQueueAutoResume');

export function startDownloadQueueAutoResume(): () => void {
  let disposed = false;

  const unsubscribe = subscribeToConnectivity((isOnline, isWifi) => {
    void (async () => {
      if (disposed || !isOnline || !isWifi) {
        return;
      }

      const worker = getSharedDownloadQueueWorker();
      const workerState = worker.getState();

      if (workerState === 'downloading' || workerState === 'paused') {
        return;
      }

      try {
        const items = await getResumableDownloadItems(true);
        if (disposed) {
          return;
        }

        const resumable = items.filter(item =>
          ['queued', 'paused', 'cancelled', 'failed'].includes(item.status),
        );

        if (resumable.length === 0) {
          return;
        }

        log.info('Auto-resuming download queue on Wi-Fi', {
          count: resumable.length,
        });
        await worker.start(resumable);
      } catch (error) {
        log.error('Download queue auto-resume failed', { error });
      }
    })();
  });

  return () => {
    disposed = true;
    unsubscribe();
  };
}

export function stopDownloadQueueAutoResume(unsubscribe: (() => void) | null) {
  unsubscribe?.();
}
