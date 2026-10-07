import type { ConnectivityProfile } from '../types/db/types';
import { logger } from './logger';
import { shouldPresentPrepareOffline } from './prepareOfflineTrigger';
import {
  isEffectivelyOnlineForTransfer,
  type TransferTransportInput,
} from './transportPolicy';

const log = logger.create('prepareOfflineAutoPrompt');

export type PrepareOfflineProjectCandidate = {
  id: number;
  name: string;
  connectivityProfile: ConnectivityProfile | null;
};

export type PrepareOfflineAutoPromptDeps = {
  isFocused: () => boolean;
  hasTransferResolved: () => boolean;
  isSettling: () => boolean;
  getTransport: () => TransferTransportInput;
  getUserId: () => number | null;
  getProjects: (userId: number) => Promise<PrepareOfflineProjectCandidate[]>;
  isAssigned: (userId: number, projectId: number) => Promise<boolean>;
  hasDownloadStarted: (userId: string, projectId: number) => boolean;
  present: (project: PrepareOfflineProjectCandidate) => void;
};

export type PrepareOfflineAutoPromptState = {
  shownThisAppOpen: boolean;
  pendingAfterSettle: boolean;
  inFlight: boolean;
};

export type PrepareOfflineAutoPromptController = {
  /** Request an evaluation (coalesces in-flight; defers while settling). */
  request: () => void;
  /** Reset per-app-open gate (background → active). */
  resetShownThisAppOpen: () => void;
  /** Re-run when settling ends if a prior request was deferred. */
  notifySettlingChanged: () => void;
  getState: () => PrepareOfflineAutoPromptState;
};

/**
 * Home Prepare-for-Offline auto-prompt evaluator (#39 / #581).
 *
 * Reads settling via `isSettling()` at call time (not a later effect). When
 * skipped for settling, sets `pendingAfterSettle` and retries on
 * `notifySettlingChanged`. Concurrent calls while in-flight are queued once.
 * Project-summary failures are logged and do not set the per-open shown gate.
 */
export function createPrepareOfflineAutoPromptController(
  deps: PrepareOfflineAutoPromptDeps,
): PrepareOfflineAutoPromptController {
  let shownThisAppOpen = false;
  let inFlight = false;
  let pendingAfterSettle = false;
  let pendingAfterInFlight = false;

  const run = async (): Promise<void> => {
    if (!deps.isFocused() || !deps.hasTransferResolved()) {
      return;
    }

    if (deps.isSettling()) {
      pendingAfterSettle = true;
      return;
    }
    pendingAfterSettle = false;

    if (
      !isEffectivelyOnlineForTransfer({
        ...deps.getTransport(),
      })
    ) {
      return;
    }

    if (shownThisAppOpen) {
      return;
    }

    if (inFlight) {
      pendingAfterInFlight = true;
      return;
    }

    inFlight = true;
    try {
      const userId = deps.getUserId();
      if (!userId) {
        return;
      }

      let projects: PrepareOfflineProjectCandidate[];
      try {
        projects = await deps.getProjects(userId);
      } catch (error) {
        log.warn('Project summary failed; will retry on next trigger', {
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      if (shownThisAppOpen) {
        return;
      }

      for (const project of projects) {
        const isAssigned = await deps.isAssigned(userId, project.id);
        const present = shouldPresentPrepareOffline({
          connectivityProfile: project.connectivityProfile,
          isAssigned,
          ...deps.getTransport(),
        });

        if (present && !deps.hasDownloadStarted(String(userId), project.id)) {
          shownThisAppOpen = true;
          deps.present(project);
          return;
        }
      }
    } finally {
      inFlight = false;
      if (pendingAfterInFlight) {
        pendingAfterInFlight = false;
        void run();
      }
    }
  };

  return {
    request: () => {
      void run();
    },
    resetShownThisAppOpen: () => {
      shownThisAppOpen = false;
    },
    notifySettlingChanged: () => {
      if (!deps.isSettling() && pendingAfterSettle) {
        void run();
      }
    },
    getState: () => ({
      shownThisAppOpen,
      pendingAfterSettle,
      inFlight,
    }),
  };
}
