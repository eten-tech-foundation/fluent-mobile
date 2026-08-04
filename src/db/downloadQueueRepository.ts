import { getDatabase } from './db';
import { logger } from '../utils/logger';
import type { Transaction } from '@op-engineering/op-sqlite';
import type {
  DownloadedProjectInventory,
  DownloadQueueItem,
  DownloadQueueStatus,
  DownloadQueueSnapshot,
  DownloadTier,
} from '../types/download/types';

const log = logger.create('DownloadQueueRepo');

type DownloadQueueRow = {
  id: string;
  project_id: number;
  tier: number;
  kind: string;
  resource_name: string;
  label: string;
  source_url: string | null;
  file_ext: string | null;
  status: DownloadQueueStatus;
  progress: number;
  bytes_total: number | null;
  local_file_path: string | null;
  resume_data: string | null;
  queue_order: number;
};

function newDownloadQueueId(): string {
  return `dlq_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function mapRow(row: DownloadQueueRow): DownloadQueueItem {
  return {
    id: row.id,
    tier: row.tier as DownloadTier,
    kind: row.kind as DownloadQueueItem['kind'],
    resourceName: row.resource_name,
    label: row.label,
    progress: row.progress,
    status: row.status,
    projectId: row.project_id,
    sourceUrl: row.source_url ?? undefined,
    fileExt: row.file_ext ?? undefined,
    bytesTotal: row.bytes_total ?? undefined,
    localFilePath: row.local_file_path ?? undefined,
    resumeData: row.resume_data ?? undefined,
  };
}

export type EnqueueDownloadItemInput = {
  projectId: number;
  tier: DownloadTier;
  kind: 'text' | 'audio';
  resourceName: string;
  label: string;
  sourceUrl?: string;
  fileExt?: string;
  bytesTotal?: number;
};

export async function enqueueDownloadItems(
  items: EnqueueDownloadItemInput[],
): Promise<string[]> {
  if (items.length === 0) return [];

  const db = getDatabase();
  const now = new Date().toISOString();
  const ids: string[] = [];

  await db.transaction(async (tx: Transaction) => {
    const maxResult = await tx.execute(
      `SELECT MAX(queue_order) AS max_order FROM download_queue`,
    );
    let nextOrder =
      Number(
        (maxResult.rows?.[0] as { max_order?: number | null } | undefined)
          ?.max_order ?? 0,
      ) + 1;

    const sorted = [...items].sort((a, b) => a.tier - b.tier);

    for (const item of sorted) {
      const id = newDownloadQueueId();

      const result = await tx.execute(
        `INSERT INTO download_queue (
           id, project_id, tier, kind, resource_name, label, source_url,
           file_ext, status, progress, bytes_total, local_file_path, resume_data, queue_order,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, NULL, NULL, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
        [
          id,
          item.projectId,
          item.tier,
          item.kind,
          item.resourceName,
          item.label,
          item.sourceUrl ?? null,
          item.fileExt ?? null,
          item.bytesTotal ?? null,
          nextOrder,
          now,
          now,
        ],
      );
      if (result.rowsAffected > 0) {
        ids.push(id);
        nextOrder += 1;
      }
    }
  });

  log.info('Enqueued download items', { count: ids.length });
  return ids;
}

export async function markDownloadItemDownloading(id: string): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE download_queue
     SET status = 'downloading', updated_at = ?
     WHERE id = ? AND status != 'completed'`,
    [now, id],
  );
}

export async function updateDownloadItemProgress(
  id: string,
  progress: number,
): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE download_queue
     SET progress = ?, updated_at = ?
     WHERE id = ? AND status = 'downloading'`,
    [progress, now, id],
  );
}

export async function markDownloadItemPaused(
  id: string,
  resumeData?: string,
): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE download_queue
     SET status = 'paused', resume_data = COALESCE(?, resume_data), updated_at = ?
     WHERE id = ? AND status IN ('queued', 'downloading', 'paused')`,
    [resumeData ?? null, now, id],
  );
}

export async function markDownloadItemCancelled(
  id: string,
  resumeData?: string,
): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE download_queue
     SET status = 'cancelled', resume_data = COALESCE(?, resume_data), updated_at = ?
     WHERE id = ? AND status != 'completed'`,
    [resumeData ?? null, now, id],
  );
}

export async function markDownloadItemCompleted(
  id: string,
  localFilePath: string,
  bytesTotal?: number,
): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE download_queue
     SET status = 'completed', progress = 1, local_file_path = ?,
         bytes_total = COALESCE(?, bytes_total), resume_data = NULL, updated_at = ?
     WHERE id = ?`,
    [localFilePath, bytesTotal ?? null, now, id],
  );
}

export async function markDownloadItemFailed(id: string): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE download_queue SET status = 'failed', updated_at = ? WHERE id = ?`,
    [now, id],
  );
}

export async function getResumableDownloadItems(
  includeCancelled = false,
): Promise<DownloadQueueItem[]> {
  const db = getDatabase();
  const statuses = includeCancelled
    ? ['queued', 'downloading', 'paused', 'cancelled', 'failed']
    : ['queued', 'downloading', 'paused', 'failed'];
  const placeholders = statuses.map(() => '?').join(', ');
  const result = await db.execute(
    `SELECT * FROM download_queue
     WHERE status IN (${placeholders})
     ORDER BY queue_order ASC`,
    statuses,
  );
  const rows = (result.rows ?? []) as unknown as DownloadQueueRow[];
  return rows.map(mapRow);
}

export async function deleteDownloadItem(id: string): Promise<void> {
  const db = getDatabase();
  await db.execute(`DELETE FROM download_queue WHERE id = ?`, [id]);
}

export async function getDownloadQueueSnapshot(): Promise<DownloadQueueSnapshot> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT * FROM download_queue
     WHERE status != 'completed'
     ORDER BY queue_order ASC`,
  );
  const rows = (result.rows ?? []) as unknown as DownloadQueueRow[];
  const items = rows.map(mapRow);

  const countResult = await db.execute(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
     FROM download_queue`,
  );
  const counts = countResult.rows?.[0] as
    | { total: number; completed: number }
    | undefined;
  const totalCount = Number(counts?.total ?? 0);
  const completedCount = Number(counts?.completed ?? 0);

  const aggregateProgress =
    totalCount > 0
      ? rows.reduce((sum, r) => sum + r.progress, 0) / totalCount +
        completedCount / totalCount
      : 0;

  const primaryProjectId = items[0]?.projectId;

  return {
    items,
    completedCount,
    totalCount,
    aggregateProgress: Math.min(1, aggregateProgress),
    primaryProjectId,
  };
}

export async function getDownloadedResourcesByProject(
  projectId: number,
): Promise<DownloadQueueItem[]> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT * FROM download_queue
     WHERE project_id = ? AND status = 'completed'
     ORDER BY resource_name`,
    [projectId],
  );
  const rows = (result.rows ?? []) as unknown as DownloadQueueRow[];
  return rows.map(mapRow);
}

export async function getDownloadedResourcesInventory(): Promise<
  DownloadedProjectInventory[]
> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT * FROM download_queue
     WHERE status = 'completed'
     ORDER BY project_id, resource_name`,
  );
  const rows = (result.rows ?? []) as unknown as DownloadQueueRow[];
  const byProject = new Map<number, DownloadQueueItem[]>();

  for (const row of rows) {
    const item = mapRow(row);
    const projectId = item.projectId;
    if (projectId === undefined) continue;
    byProject.set(projectId, [...(byProject.get(projectId) ?? []), item]);
  }

  return [...byProject.entries()].map(([projectId, resources]) => ({
    projectId,
    resources,
    totalBytes: resources.reduce(
      (sum, resource) => sum + (resource.bytesTotal ?? 0),
      0,
    ),
  }));
}
