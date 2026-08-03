export interface PrepareOfflineChapterRow {
  id: number;
  bookId: number;
  bookName: string;
  chapterNumber: number;
  assignedUserId: number | null;
}

export interface PrepareOfflineBookGroup {
  bookId: number;
  bookName: string;
  chapters: PrepareOfflineChapterRow[];
}

export type PrepareOfflineResourceTier = 1 | 2 | 3;

export type PrepareOfflineResourceKind = 'text' | 'audio';

export type PrepareOfflineResourceStatus =
  | 'completed'
  | 'selected'
  | 'available'
  | 'downloading';

export interface PrepareOfflineResourceItem {
  id: string;
  tier: PrepareOfflineResourceTier;
  kind: PrepareOfflineResourceKind;
  groupName: string;
  label: string;
  bytes: number;
  status: PrepareOfflineResourceStatus;
  bookId?: number;
  chapterId?: number;
}

export interface PrepareOfflineResourceGroup {
  groupName: string;
  items: PrepareOfflineResourceItem[];
}

export interface PrepareOfflineCatalog {
  items: PrepareOfflineResourceItem[];
  groups: PrepareOfflineResourceGroup[];
}

export interface BuildPrepareOfflineCatalogInput {
  manifest: PrepareOfflineResourceManifestEntry[];
  getResourceStatus: (resourceId: string) => PrepareOfflineResourceStatus;
  chapters: PrepareOfflineChapterRow[];
  selectedIds: Set<number>;
}

/** Scope for byte estimation — mirrors expected fluent-api manifest shape. */
export type PrepareOfflineResourceScope = 'chapter' | 'book' | 'project';

/**
 * Static resource manifest entry (fluent-api shape until contract lands).
 * `unitBytes` is multiplied by selected chapter/book count per `scope`.
 */
export interface PrepareOfflineResourceManifestEntry {
  resourceKey: string;
  tier: PrepareOfflineResourceTier;
  groupName: string;
  kind: PrepareOfflineResourceKind;
  scope: PrepareOfflineResourceScope;
  unitBytes: number;
}

/** On-device inventory row keyed by resource id (from #201 in production). */
export interface PrepareOfflineResourceInventoryEntry {
  resourceId: string;
  status: PrepareOfflineResourceStatus;
}
