import { getDatabase } from './db';
import { logger } from '../utils/logger';
import type { Transaction } from '@op-engineering/op-sqlite';
import type {
  DownloadQueueItem,
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
  status: DownloadQueueItem['status'];
  progress: number;
  bytes_total: number | null;
  local_file_path: string | null;
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
    label: row.label,
    progress: row.progress,
    status: row.status,
    projectId: row.project_id,
    bytesTotal: row.bytes_total ?? undefined,
    localFilePath: row.local_file_path ?? undefined,
  };
}

export type EnqueueDownloadItemInput = {
  projectId: number;
  tier: DownloadTier;
  kind: 'text' | 'audio';
  resourceName: string;
  label: string;
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
      ids.push(id);
      await tx.execute(
        `INSERT INTO download_queue (
           id, project_id, tier, kind, resource_name, label, status,
           progress, bytes_total, local_file_path, queue_order,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, NULL, ?, ?, ?)`,
        [
          id,
          item.projectId,
          item.tier,
          item.kind,
          item.resourceName,
          item.label,
          item.bytesTotal ?? null,
          nextOrder,
          now,
          now,
        ],
      );
      nextOrder += 1;
    }
  });

  log.info('Enqueued download items', { count: ids.length });
  return ids;
}

export async function updateDownloadItemProgress(
  id: string,
  progress: number,
): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE download_queue
     SET progress = ?, status = 'downloading', updated_at = ?
     WHERE id = ?`,
    [progress, now, id],
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
         bytes_total = COALESCE(?, bytes_total), updated_at = ?
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
