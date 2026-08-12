import { PrepareOfflineResourceManifestEntry } from '../../types/prepareOffline/types';
import {
  kindLabel,
  manifestEntryToResourceId,
} from '../../utils/prepareOfflineResourceId';
import { DEV_MOCK_FILE_BYTES } from './mockDownloadSources';

export { kindLabel, manifestEntryToResourceId };

/**
 * Prepare for Offline — mock offline download catalog (#51 dev QA).
 *
 * **Role:** Static catalog of everything that *can* be downloaded for a project —
 * resource names, tiers (1/2/3), text/audio/image kinds, byte sizes, and scope
 * (chapter | book | project). Stand-in for a future FluentAPI manifest (#201).
 *
 * **Byte sizes:** `unitBytes` per kind match `DEV_MOCK_FILE_BYTES` in
 * `mockDownloadSources.ts` (one fixture URL per kind). Totals reflect real
 * on-device storage after download, not the product mockup (~338 MB).
 *
 * **Works with:**
 * - `offlineDownloadInventoryScenarios.ts` — uses `MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST` and
 *   `manifestEntryToResourceId()` to build per-item inventory states.
 * - `offlineDownloadInventoryRuntime.ts` — reads resource ids from here when resolving status; does
 *   not duplicate catalog data.
 * - `prepareOfflineResources.ts` (service) — fetches manifest; production code imports here only
 *
 * **Production replacement:** `FluentAPI.getPrepareOfflineManifest(projectId)`
 * returning `PrepareOfflineResourceManifestEntry[]` (see `types/prepareOffline/types.ts`).
 */
export const MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST: PrepareOfflineResourceManifestEntry[] =
  [
    {
      resourceKey: 'source-bible',
      tier: 1,
      groupName: 'Source Bible',
      kind: 'text',
      scope: 'chapter',
      unitBytes: DEV_MOCK_FILE_BYTES.text,
    },
    {
      resourceKey: 'source-bible',
      tier: 1,
      groupName: 'Source Bible',
      kind: 'audio',
      scope: 'chapter',
      unitBytes: DEV_MOCK_FILE_BYTES.audio,
    },
    {
      resourceKey: 'translation-notes',
      tier: 1,
      groupName: 'Translation Notes',
      kind: 'text',
      scope: 'chapter',
      unitBytes: DEV_MOCK_FILE_BYTES.text,
    },
    {
      resourceKey: 'translation-notes',
      tier: 1,
      groupName: 'Translation Notes',
      kind: 'audio',
      scope: 'chapter',
      unitBytes: DEV_MOCK_FILE_BYTES.audio,
    },
    {
      resourceKey: 'translation-words',
      tier: 2,
      groupName: 'Translation Words',
      kind: 'text',
      scope: 'project',
      unitBytes: DEV_MOCK_FILE_BYTES.text,
    },
    {
      resourceKey: 'translation-words',
      tier: 2,
      groupName: 'Translation Words',
      kind: 'audio',
      scope: 'project',
      unitBytes: DEV_MOCK_FILE_BYTES.audio,
    },
    {
      resourceKey: 'translation-questions',
      tier: 2,
      groupName: 'Translation Questions',
      kind: 'text',
      scope: 'chapter',
      unitBytes: DEV_MOCK_FILE_BYTES.text,
    },
    {
      resourceKey: 'translation-questions',
      tier: 2,
      groupName: 'Translation Questions',
      kind: 'audio',
      scope: 'chapter',
      unitBytes: DEV_MOCK_FILE_BYTES.audio,
    },
    {
      resourceKey: 'bible-commentary',
      tier: 3,
      groupName: 'Bible Commentary',
      kind: 'text',
      scope: 'project',
      unitBytes: DEV_MOCK_FILE_BYTES.text,
    },
    {
      resourceKey: 'bible-commentary',
      tier: 3,
      groupName: 'Bible Commentary',
      kind: 'audio',
      scope: 'project',
      unitBytes: DEV_MOCK_FILE_BYTES.audio,
    },
    {
      resourceKey: 'reference-images',
      tier: 3,
      groupName: 'Reference Images',
      kind: 'image',
      scope: 'project',
      unitBytes: DEV_MOCK_FILE_BYTES.image,
    },
    {
      resourceKey: 'alternate-translations',
      tier: 3,
      groupName: 'Alternate Translations',
      kind: 'text',
      scope: 'project',
      unitBytes: DEV_MOCK_FILE_BYTES.text,
    },
    {
      resourceKey: 'alternate-translations',
      tier: 3,
      groupName: 'Alternate Translations',
      kind: 'audio',
      scope: 'project',
      unitBytes: DEV_MOCK_FILE_BYTES.audio,
    },
  ];
