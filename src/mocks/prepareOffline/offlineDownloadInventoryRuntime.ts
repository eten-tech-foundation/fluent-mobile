/**
 * Prepare for Offline — mock on-device inventory runtime (#51 dev QA).
 *
 * **Role:** In-memory store for *what is already on the device* (or downloading)
 * per project + resource id. Answers `getMockPrepareOfflineResourceStatus()` used
 * by `prepareOfflineCatalog.ts` to set each row's status icon and pending bytes.
 * Stand-in for SQLite/filesystem inventory (#201).
 *
 * **Works with:**
 * - `offlineDownloadCatalog.ts` — resource ids (`tier-1-source-bible-text`, etc.) come from
 *   `manifestEntryToResourceId()`; inventory never defines sizes or tiers.
 * - `offlineDownloadInventoryScenarios.ts` — `buildMockInventoryForScenario()` seeds the initial state;
 *   `DEFAULT_PREPARE_OFFLINE_MOCK_INVENTORY_SCENARIO` picks which preset loads.
 * - `prepareOfflineDownload.ts` — after Download tap, calls
 *   `simulateMockPrepareOfflineDownload()` here to mimic the #201 worker
 *   (tier-ordered progress ~2.5s per item).
 * - `usePrepareOfflineResources.ts` — subscribes via `subscribeMockPrepareOfflineInventory`
 *   so the UI rebuilds when simulation advances status. Remounting resets package
 *   checkboxes only; runtime inventory overrides are kept so Resources can gate
 *   on completed downloads in the same app session.
 *
 * **Layers:** scenario base → per-project runtime overrides → cumulative tier normalize
 * (from offlineDownloadInventoryScenarios.ts) on every read.
 *
 * **Production replacement:** persisted inventory repo (#201) + worker events instead
 * of `simulateMockPrepareOfflineDownload`.
 */
import { PrepareOfflineResourceStatus } from '../../types/prepareOffline/types';
import {
  buildMockInventoryForScenario,
  DEFAULT_PREPARE_OFFLINE_MOCK_INVENTORY_SCENARIO,
  normalizeCumulativeTierInventory,
  PrepareOfflineMockInventoryScenario,
} from './offlineDownloadInventoryScenarios';

type InventoryListener = () => void;

const runtimeOverrides = new Map<string, PrepareOfflineResourceStatus>();
const listeners = new Set<InventoryListener>();
let downloadSimulationTimer: ReturnType<typeof setInterval> | null = null;

let activeScenario: PrepareOfflineMockInventoryScenario =
  DEFAULT_PREPARE_OFFLINE_MOCK_INVENTORY_SCENARIO;

function inventoryKey(projectId: number, resourceId: string): string {
  return `${projectId}:${resourceId}`;
}

function notifyInventoryListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function getScenarioInventory(): Record<string, PrepareOfflineResourceStatus> {
  return buildMockInventoryForScenario(activeScenario);
}

function getEffectiveInventoryForProject(
  projectId: number,
): Record<string, PrepareOfflineResourceStatus> {
  const inventory = { ...getScenarioInventory() };
  const prefix = `${projectId}:`;

  for (const [key, status] of runtimeOverrides.entries()) {
    if (key.startsWith(prefix)) {
      inventory[key.slice(prefix.length)] = status;
    }
  }

  return normalizeCumulativeTierInventory(inventory);
}

export function getPrepareOfflineMockInventoryScenario(): PrepareOfflineMockInventoryScenario {
  return activeScenario;
}

/** Switch dev scenario at runtime (e.g. tests); clears download simulation overrides. */
export function setPrepareOfflineMockInventoryScenario(
  scenario: PrepareOfflineMockInventoryScenario,
): void {
  activeScenario = scenario;
  runtimeOverrides.clear();
  stopMockDownloadSimulation();
  notifyInventoryListeners();
}

export function getMockPrepareOfflineResourceStatus(
  projectId: number,
  resourceId: string,
): PrepareOfflineResourceStatus {
  return getEffectiveInventoryForProject(projectId)[resourceId] ?? 'selected';
}

export function setMockPrepareOfflineResourceStatus(
  projectId: number,
  resourceId: string,
  status: PrepareOfflineResourceStatus,
): void {
  runtimeOverrides.set(inventoryKey(projectId, resourceId), status);
  notifyInventoryListeners();
}

export function subscribeMockPrepareOfflineInventory(
  listener: InventoryListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearMockPrepareOfflineRuntimeInventory(): void {
  runtimeOverrides.clear();
  stopMockDownloadSimulation();
  notifyInventoryListeners();
}

export function resetMockPrepareOfflineInventory(): void {
  activeScenario = DEFAULT_PREPARE_OFFLINE_MOCK_INVENTORY_SCENARIO;
  clearMockPrepareOfflineRuntimeInventory();
}

export function stopMockDownloadSimulation(): void {
  if (downloadSimulationTimer) {
    clearInterval(downloadSimulationTimer);
    downloadSimulationTimer = null;
  }
}

/**
 * Dev-only: after Download tap, mark the first pending item downloading and
 * advance completed → next pending every few seconds (simulates #201 worker).
 */
export function simulateMockPrepareOfflineDownload(
  projectId: number,
  resourceIdsInTierOrder: string[],
): void {
  if (!__DEV__) {
    return;
  }

  stopMockDownloadSimulation();

  const pendingIds = resourceIdsInTierOrder.filter(
    id => getMockPrepareOfflineResourceStatus(projectId, id) !== 'completed',
  );

  if (pendingIds.length === 0) {
    return;
  }

  for (const id of resourceIdsInTierOrder) {
    const status = getMockPrepareOfflineResourceStatus(projectId, id);
    if (status === 'downloading') {
      setMockPrepareOfflineResourceStatus(projectId, id, 'selected');
    }
  }

  setMockPrepareOfflineResourceStatus(projectId, pendingIds[0], 'downloading');

  downloadSimulationTimer = setInterval(() => {
    const activeId = pendingIds.find(
      id =>
        getMockPrepareOfflineResourceStatus(projectId, id) === 'downloading',
    );

    if (!activeId) {
      stopMockDownloadSimulation();
      return;
    }

    setMockPrepareOfflineResourceStatus(projectId, activeId, 'completed');

    const nextId = pendingIds.find(
      id => getMockPrepareOfflineResourceStatus(projectId, id) === 'selected',
    );

    if (nextId) {
      setMockPrepareOfflineResourceStatus(projectId, nextId, 'downloading');
    } else {
      stopMockDownloadSimulation();
    }
  }, 2500);
}
