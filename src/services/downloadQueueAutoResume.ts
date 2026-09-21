import { getResumableDownloadItems } from '../db/repository';
import {
  transportAllowsTransfer,
  type TransferTransportInput,
} from '../utils/transportPolicy';
import {
  getTransferTransportSnapshot,
  subscribeToConnectivity,
} from './connectivity';
import { getSharedDownloadQueueWorker } from './downloadQueueWorkerSingleton';
import { logger } from '../utils/logger';
import {
  transportQaLog,
  transportQaLogGate,
  transportQaLogItensDownload,
} from '../utils/transportQaLog';
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

      const transport: TransferTransportInput = {
        isOnline: snapshot.isOnline,
        isWifi: snapshot.isWifi,
        connectionType: snapshot.connectionType,
        uploadOverCellular: getUploadOverCellular(),
      };

      const gate = transportAllowsTransfer(transport);
      transportQaLogGate('auto-retomar fila', gate, {
        isOnline: transport.isOnline,
        isWifi: transport.isWifi,
        connectionType: transport.connectionType,
        uploadOverCellular: transport.uploadOverCellular,
      });
      if (gate !== 'ok') {
        transportQaLog(
          'DOWNLOAD',
          'Auto-retomar ignorado — transporte não permite',
        );
        return;
      }

      const worker = getSharedDownloadQueueWorker();
      const workerState = worker.getState();

      if (workerState === 'downloading' || workerState === 'paused') {
        transportQaLog(
          'DOWNLOAD',
          `Auto-retomar ignorado — worker em estado "${workerState}"`,
        );
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
          transportQaLog(
            'DOWNLOAD',
            'Auto-retomar: nenhum item elegível na fila',
          );
          return;
        }

        transportQaLogItensDownload('Auto-retomar iniciando', resumable);

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

  const unsubscribeConnectivity = subscribeToConnectivity(() => {
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
