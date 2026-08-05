import { PrepareOfflineResourceManifestEntry } from '../../types/prepareOffline/types';
import {
  kindLabel,
  manifestEntryToResourceId,
} from '../../utils/prepareOfflineResourceId';

export { kindLabel, manifestEntryToResourceId };

const MB = 1024 * 1024;

/**
 * Prepare for Offline — mock offline download catalog (#51 dev QA).
 *
 * **Role:** Static catalog of everything that *can* be downloaded for a project —
 * resource names, tiers (1/2/3), text/audio kinds, byte sizes, and scope
 * (chapter | book | project). Stand-in for a future FluentAPI manifest (#201).
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
 *
 * Visual QA (1 chapter selected) matches product mockup sizes:
 * Tier 1 Source Bible 8/136 MB + Translation Notes 18/48 MB;
 * Tier 2 Translation Words 10/32 MB + Translation Questions 6/14 MB;
 * Tier 3 ~66 MB → ~338 MB total.
 */
export const MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST: PrepareOfflineResourceManifestEntry[] =
  [
    {
      resourceKey: 'source-bible',
      tier: 1,
      groupName: 'Source Bible',
      kind: 'text',
      scope: 'chapter',
      unitBytes: 8 * MB,
    },
    {
      resourceKey: 'source-bible',
      tier: 1,
      groupName: 'Source Bible',
      kind: 'audio',
      scope: 'chapter',
      unitBytes: 136 * MB,
    },
    {
      resourceKey: 'translation-notes',
      tier: 1,
      groupName: 'Translation Notes',
      kind: 'text',
      scope: 'chapter',
      unitBytes: 18 * MB,
    },
    {
      resourceKey: 'translation-notes',
      tier: 1,
      groupName: 'Translation Notes',
      kind: 'audio',
      scope: 'chapter',
      unitBytes: 48 * MB,
    },
    {
      resourceKey: 'translation-words',
      tier: 2,
      groupName: 'Translation Words',
      kind: 'text',
      scope: 'project',
      unitBytes: 10 * MB,
    },
    {
      resourceKey: 'translation-words',
      tier: 2,
      groupName: 'Translation Words',
      kind: 'audio',
      scope: 'project',
      unitBytes: 32 * MB,
    },
    {
      resourceKey: 'translation-questions',
      tier: 2,
      groupName: 'Translation Questions',
      kind: 'text',
      scope: 'chapter',
      unitBytes: 6 * MB,
    },
    {
      resourceKey: 'translation-questions',
      tier: 2,
      groupName: 'Translation Questions',
      kind: 'audio',
      scope: 'chapter',
      unitBytes: 14 * MB,
    },
    {
      resourceKey: 'bible-commentary',
      tier: 3,
      groupName: 'Bible Commentary',
      kind: 'text',
      scope: 'project',
      unitBytes: 12 * MB,
    },
    {
      resourceKey: 'bible-commentary',
      tier: 3,
      groupName: 'Bible Commentary',
      kind: 'audio',
      scope: 'project',
      unitBytes: 24 * MB,
    },
    {
      resourceKey: 'reference-images',
      tier: 3,
      groupName: 'Reference Images',
      kind: 'text',
      scope: 'project',
      unitBytes: 6 * MB,
    },
    {
      resourceKey: 'alternate-translations',
      tier: 3,
      groupName: 'Alternate Translations',
      kind: 'text',
      scope: 'project',
      unitBytes: 8 * MB,
    },
    {
      resourceKey: 'alternate-translations',
      tier: 3,
      groupName: 'Alternate Translations',
      kind: 'audio',
      scope: 'project',
      unitBytes: 16 * MB,
    },
  ];
