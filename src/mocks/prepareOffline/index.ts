/**
 * Prepare for Offline — mock data barrel (#51 dev QA).
 *
 * Re-exports the three mock modules and their public API:
 *
 * | Module                               | Answers                          | Production (#201)        |
 * |--------------------------------------|----------------------------------|--------------------------|
 * | `offlineDownloadCatalog.ts`          | What *can* be downloaded?        | FluentAPI manifest       |
 * | `offlineDownloadInventoryScenarios.ts` | Preset on-device states for QA | (dev-only)               |
 * | `offlineDownloadInventoryRuntime.ts` | Live status per resource + sim   | SQLite/filesystem + worker |
 *
 * Data flow: catalog + inventory (status) → `prepareOfflineCatalog.ts` → UI.
 *
 * Consumed via `prepareOfflineResources.ts` until FluentAPI manifest lands.
 */
export {
  MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST,
  manifestEntryToResourceId,
  kindLabel,
} from './offlineDownloadCatalog';
export {
  PREPARE_OFFLINE_MOCK_INVENTORY_SCENARIOS,
  PREPARE_OFFLINE_MOCK_SCENARIO_LABELS,
  DEFAULT_PREPARE_OFFLINE_MOCK_INVENTORY_SCENARIO,
  MOCK_PREPARE_OFFLINE_MIXED_INVENTORY,
  buildMockInventoryForScenario,
  getDefaultDeselectedItemIdsForScenario,
  getTiersIncludedInPackageForScenario,
  normalizeCumulativeTierInventory,
  isPrepareOfflineMockInventoryScenario,
  type PrepareOfflineMockInventoryScenario,
} from './offlineDownloadInventoryScenarios';
export {
  DEV_MOCK_FILE_BYTES,
  getMockDownloadBytesForKind,
  getMockDownloadSource,
} from './mockDownloadSources';
export {
  getMockPrepareOfflineResourceStatus,
  getPrepareOfflineMockInventoryScenario,
  setMockPrepareOfflineResourceStatus,
  setPrepareOfflineMockInventoryScenario,
  clearMockPrepareOfflineRuntimeInventory,
  subscribeMockPrepareOfflineInventory,
  resetMockPrepareOfflineInventory,
  simulateMockPrepareOfflineDownload,
  stopMockDownloadSimulation,
} from './offlineDownloadInventoryRuntime';
