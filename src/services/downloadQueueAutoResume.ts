import { getResumableDownloadItems } from '../db/repository';
import {
  transferInputFromLinkSnapshot,
  transportAllowsTransfer,
} from '../utils/transportPolicy';
import {
  getTransferTransportSnapshot,
  subscribeToTransferTransport,
} from './connectivity';
import { getSharedDownloadQueueWorker } from './downloadQueueWorkerSingleton';
import { logger } from '../utils/logger';
import {
  getUploadOverCellular,
  subscribeToPreference,
} from './userPreferences';

const log = logger.create('downloadQueueAutoResume');

export function startDownloadQueueAutoResume(): () => void {
  let disposed = false;

  const evaluate = () => {
    void (async () => {
      if (disposed) {
        return;
      }

      const snapshot = await getTransferTransportSnapshot();
      if (disposed) {
        return;
      }

      const gate = transportAllowsTransfer(
        transferInputFromLinkSnapshot(snapshot, getUploadOverCellular()),
      );
      const worker = getSharedDownloadQueueWorker();
      const workerState = worker.getState();

      if (gate !== 'ok') {
        // Pause in-flight work when Wi-Fi drops / cellular is blocked (#619).
        if (workerState === 'downloading') {
          log.info(
            'Pausing download queue — transport no longer allows transfer',
            {
              gate,
              isLinkOnline: snapshot.isLinkOnline,
              isWifi: snapshot.isWifi,
              connectionType: snapshot.connectionType,
            },
          );
          try {
            await worker.pause('transport');
          } catch (error) {
            log.error('Failed to pause download queue on transport loss', {
              error,
            });
          }
        }
        return;
      }

      if (workerState === 'downloading') {
        return;
      }

      // Only auto-resume transport pauses — do not undo an intentional UI Pause.
      if (workerState === 'paused') {
        if (worker.getPauseReason() !== 'transport') {
          return;
        }
        log.info('Auto-resuming paused download queue when transport allows', {
          isLinkOnline: snapshot.isLinkOnline,
          isWifi: snapshot.isWifi,
          connectionType: snapshot.connectionType,
        });
        try {
          await worker.resume();
        } catch (error) {
          log.error('Download queue auto-resume (paused worker) failed', {
            error,
          });
        }
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

        log.info(
          'Auto-resuming download queue when transport allows transfer',
          {
            count: resumable.length,
          },
        );
        await worker.start(resumable);
      } catch (error) {
        log.error('Download queue auto-resume failed', { error });
      }
    })();
  };

  const unsubscribeConnectivity = subscribeToTransferTransport(() => {
    evaluate();
  });

  const unsubscribePref = subscribeToPreference('uploadOverCellular', () => {
    evaluate();
  });

  return () => {
    disposed = true;
    unsubscribeConnectivity();
    unsubscribePref();
  };
}

export function stopDownloadQueueAutoResume(unsubscribe: (() => void) | null) {
  unsubscribe?.();
}
