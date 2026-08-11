type Row = {
  id: string;
  project_id: number;
  user_id: number | null;
  tier: number;
  kind: string;
  resource_name: string;
  label: string;
  source_url: string | null;
  file_ext: string | null;
  status:
    | 'queued'
    | 'downloading'
    | 'paused'
    | 'cancelled'
    | 'completed'
    | 'failed';
  progress: number;
  bytes_total: number | null;
  local_file_path: string | null;
  resume_data: string | null;
  queue_order: number;
  created_at: string;
  updated_at: string;
};

let rows: Row[] = [];

function clone(row: Row): Row {
  return { ...row };
}

export function resetDownloadQueueDbMock(): void {
  rows = [];
}

export function __getDownloadQueueRows(): Row[] {
  return rows.map(clone);
}

type ExecuteResult = { rows: unknown[]; rowsAffected?: number };

async function mockExecute(
  sql: string,
  params: unknown[] = [],
): Promise<ExecuteResult> {
  const normalized = sql.replace(/\s+/g, ' ').trim();

  if (normalized.startsWith('SELECT MAX(queue_order)')) {
    const max = rows.reduce((m, r) => Math.max(m, r.queue_order), 0);
    return { rows: [{ max_order: max || null }] };
  }

  if (normalized.startsWith('INSERT INTO download_queue')) {
    const [
      id,
      projectId,
      userId,
      tier,
      kind,
      resourceName,
      label,
      sourceUrl,
      fileExt,
      bytesTotal,
      queueOrder,
      createdAt,
      updatedAt,
    ] = params as [
      string,
      number,
      number,
      number,
      string,
      string,
      string,
      string | null,
      string | null,
      number | null,
      number,
      string,
      string,
    ];
    rows.push({
      id,
      project_id: projectId,
      user_id: userId,
      tier,
      kind,
      resource_name: resourceName,
      label,
      source_url: sourceUrl,
      file_ext: fileExt,
      status: 'queued',
      progress: 0,
      bytes_total: bytesTotal,
      local_file_path: null,
      resume_data: null,
      queue_order: queueOrder,
      created_at: createdAt,
      updated_at: updatedAt,
    });
    return { rows: [], rowsAffected: 1 };
  }

  if (
    normalized ===
    "UPDATE download_queue SET progress = ?, updated_at = ? WHERE id = ? AND status = 'downloading'"
  ) {
    const [progress, updatedAt, id] = params as [number, string, string];

    rows = rows.map(r =>
      r.id === id && r.status === 'downloading'
        ? { ...r, progress, updated_at: updatedAt }
        : r,
    );

    return { rows: [] };
  }

  if (
    normalized.startsWith("UPDATE download_queue SET status = 'downloading'")
  ) {
    const [updatedAt, id] = params as [string, string];
    rows = rows.map(r =>
      r.id === id && r.status !== 'completed'
        ? { ...r, status: 'downloading', updated_at: updatedAt }
        : r,
    );
    return { rows: [] };
  }

  if (normalized.startsWith("UPDATE download_queue SET status = 'paused'")) {
    const [resumeData, updatedAt, id] = params as [
      string | null,
      string,
      string,
    ];
    rows = rows.map(r =>
      r.id === id &&
      (r.status === 'queued' ||
        r.status === 'downloading' ||
        r.status === 'paused')
        ? {
            ...r,
            status: 'paused',
            resume_data: resumeData ?? r.resume_data,
            updated_at: updatedAt,
          }
        : r,
    );
    return { rows: [] };
  }

  if (
    normalized.includes('project_id = ?') &&
    normalized.includes("status IN ('downloading', 'paused')") &&
    normalized.startsWith("UPDATE download_queue SET status = 'cancelled'")
  ) {
    const [updatedAt, projectId] = params as [string, number];
    rows = rows.map(r =>
      r.project_id === projectId &&
      (r.status === 'downloading' || r.status === 'paused')
        ? { ...r, status: 'cancelled', updated_at: updatedAt }
        : r,
    );
    return { rows: [] };
  }

  if (normalized.startsWith("UPDATE download_queue SET status = 'cancelled'")) {
    const [resumeData, updatedAt, id] = params as [
      string | null,
      string,
      string,
    ];
    rows = rows.map(r =>
      r.id === id && r.status !== 'completed'
        ? {
            ...r,
            status: 'cancelled',
            resume_data: resumeData ?? r.resume_data,
            updated_at: updatedAt,
          }
        : r,
    );
    return { rows: [] };
  }

  if (normalized.startsWith("UPDATE download_queue SET status = 'completed'")) {
    const [localFilePath, bytesTotal, updatedAt, id] = params as [
      string,
      number | null,
      string,
      string,
    ];
    rows = rows.map(r =>
      r.id === id
        ? {
            ...r,
            status: 'completed',
            progress: 1,
            local_file_path: localFilePath,
            bytes_total: bytesTotal ?? r.bytes_total,
            resume_data: null,
            updated_at: updatedAt,
          }
        : r,
    );
    return { rows: [] };
  }

  if (normalized.startsWith("UPDATE download_queue SET status = 'failed'")) {
    const [updatedAt, id] = params as [string, string];
    rows = rows.map(r =>
      r.id === id ? { ...r, status: 'failed', updated_at: updatedAt } : r,
    );
    return { rows: [] };
  }

  if (normalized.startsWith('DELETE FROM download_queue WHERE id = ?')) {
    const id = params[0] as string;
    rows = rows.filter(r => r.id !== id);
    return { rows: [] };
  }

  if (
    normalized.startsWith(
      "SELECT * FROM download_queue WHERE status != 'completed'",
    )
  ) {
    return {
      rows: rows
        .filter(r => r.status !== 'completed')
        .sort((a, b) => a.queue_order - b.queue_order)
        .map(clone),
    };
  }

  if (normalized.startsWith('SELECT * FROM download_queue WHERE status IN')) {
    const statuses = new Set(params as Row['status'][]);
    return {
      rows: rows
        .filter(r => statuses.has(r.status))
        .sort((a, b) => a.queue_order - b.queue_order)
        .map(clone),
    };
  }

  if (normalized.startsWith('SELECT COUNT(*) AS total')) {
    const total = rows.length;
    const completed = rows.filter(r => r.status === 'completed').length;
    return { rows: [{ total, completed }] };
  }

  if (
    normalized.startsWith(
      "SELECT * FROM download_queue WHERE project_id = ? AND status = 'completed' AND user_id = ?",
    )
  ) {
    const [projectId, userId] = params as [number, number];
    return {
      rows: rows
        .filter(
          r =>
            r.project_id === projectId &&
            r.status === 'completed' &&
            r.user_id === userId,
        )
        .sort((a, b) => a.resource_name.localeCompare(b.resource_name))
        .map(clone),
    };
  }

  if (
    normalized.startsWith('SELECT * FROM download_queue WHERE project_id = ?')
  ) {
    const projectId = params[0] as number;
    return {
      rows: rows
        .filter(r => r.project_id === projectId && r.status === 'completed')
        .sort((a, b) => a.resource_name.localeCompare(b.resource_name))
        .map(clone),
    };
  }

  if (
    normalized.startsWith(
      "SELECT * FROM download_queue WHERE status = 'completed' AND user_id = ?",
    )
  ) {
    const userId = params[0] as number;
    return {
      rows: rows
        .filter(r => r.status === 'completed' && r.user_id === userId)
        .sort((a, b) => a.project_id - b.project_id)
        .map(clone),
    };
  }

  if (
    normalized.startsWith(
      "SELECT * FROM download_queue WHERE status = 'completed'",
    )
  ) {
    return {
      rows: rows
        .filter(r => r.status === 'completed')
        .sort((a, b) => a.project_id - b.project_id)
        .map(clone),
    };
  }

  throw new Error(`Unhandled SQL in download_queue mock: ${normalized}`);
}

jest.mock('./db', () => ({
  getDatabase: () => ({
    execute: mockExecute,
    transaction: async (
      fn: (tx: { execute: typeof mockExecute }) => Promise<void>,
    ) => {
      await fn({ execute: mockExecute });
    },
  }),
}));

import {
  deleteDownloadItem,
  enqueueDownloadItems,
  getDownloadedResourcesInventory,
  getDownloadedResourcesByProject,
  getDownloadQueueSnapshot,
  getResumableDownloadItems,
  markDownloadItemCompleted,
  markDownloadItemCancelled,
  cancelProjectDownloadTransfers,
  markDownloadItemFailed,
  markDownloadItemPaused,
  updateDownloadItemProgress,
  markDownloadItemDownloading,
} from './downloadQueueRepository';

const TEST_USER_ID = 7;

describe('downloadQueueRepository', () => {
  beforeEach(() => {
    resetDownloadQueueDbMock();
  });

  it('enqueues items in tier order regardless of input array order', async () => {
    const ids = await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 2,
        kind: 'text',
        resourceName: 'Translation Notes',
        label: 'Translation Notes — Text',
      },
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Source Bible — Audio',
      },
    ]);

    expect(ids).toHaveLength(2);
    const stored = __getDownloadQueueRows().sort(
      (a, b) => a.queue_order - b.queue_order,
    );
    expect(stored[0].resource_name).toBe('Source Bible');
    expect(stored[0].tier).toBe(1);
    expect(stored[1].resource_name).toBe('Translation Notes');
    expect(stored[1].tier).toBe(2);
    expect(stored[0].status).toBe('queued');
    expect(stored[0].progress).toBe(0);
  });

  it('continues queue_order across multiple enqueue calls rather than restarting', async () => {
    await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Source Bible — Audio',
      },
    ]);
    await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 2,
        kind: 'text',
        resourceName: 'Translation Words',
        label: 'Translation Words — Text',
      },
    ]);

    const stored = __getDownloadQueueRows().sort(
      (a, b) => a.queue_order - b.queue_order,
    );
    expect(stored[0].queue_order).toBeLessThan(stored[1].queue_order);
  });

  it('returns an empty array without touching the db when given no items', async () => {
    const ids = await enqueueDownloadItems([]);
    expect(ids).toEqual([]);
    expect(__getDownloadQueueRows()).toHaveLength(0);
  });

  it('updates progress and flips status to downloading', async () => {
    const [id] = await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Source Bible — Audio',
      },
    ]);

    await markDownloadItemDownloading(id);
    await updateDownloadItemProgress(id, 0.42);

    const row = __getDownloadQueueRows().find(r => r.id === id);
    expect(row?.progress).toBe(0.42);
    expect(row?.status).toBe('downloading');
  });

  it('stores resource source metadata for the worker resolver', async () => {
    const [id] = await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Source Bible — Audio',
        sourceUrl: 'https://example.com/source.mp3',
        fileExt: 'mp3',
      },
    ]);

    const row = __getDownloadQueueRows().find(r => r.id === id);
    expect(row?.source_url).toBe('https://example.com/source.mp3');
    expect(row?.file_ext).toBe('mp3');
  });

  it('persists paused and cancelled state with resumable metadata', async () => {
    const [pausedId, cancelledId] = await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Source Bible — Audio',
      },
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 2,
        kind: 'text',
        resourceName: 'Translation Notes',
        label: 'Translation Notes — Text',
      },
    ]);

    await markDownloadItemPaused(pausedId, '{"resumeData":"paused"}');
    await markDownloadItemCancelled(cancelledId, '{"resumeData":"cancelled"}');

    const rows = __getDownloadQueueRows();
    expect(rows.find(r => r.id === pausedId)?.status).toBe('paused');
    expect(rows.find(r => r.id === pausedId)?.resume_data).toBe(
      '{"resumeData":"paused"}',
    );
    expect(rows.find(r => r.id === cancelledId)?.status).toBe('cancelled');
    expect(rows.find(r => r.id === cancelledId)?.resume_data).toBe(
      '{"resumeData":"cancelled"}',
    );
  });

  it('cancelProjectDownloadTransfers marks downloading and paused rows cancelled', async () => {
    const [downloadingId, pausedId, queuedId] = await enqueueDownloadItems([
      {
        projectId: 7,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'text',
        resourceName: 'Source Bible',
        label: 'Text',
      },
      {
        projectId: 7,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Audio',
      },
      {
        projectId: 7,
        userId: TEST_USER_ID,
        tier: 2,
        kind: 'text',
        resourceName: 'Translation Words',
        label: 'Words Text',
      },
    ]);

    await markDownloadItemDownloading(downloadingId);
    await markDownloadItemPaused(pausedId, '{"resumeData":"paused"}');

    await cancelProjectDownloadTransfers(7);

    const rows = __getDownloadQueueRows();
    expect(rows.find(r => r.id === downloadingId)?.status).toBe('cancelled');
    expect(rows.find(r => r.id === pausedId)?.status).toBe('cancelled');
    expect(rows.find(r => r.id === queuedId)?.status).toBe('queued');
  });

  it('returns resumable queue items in queue order', async () => {
    const [id1, id2] = await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Source Bible — Audio',
      },
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 2,
        kind: 'text',
        resourceName: 'Translation Notes',
        label: 'Translation Notes — Text',
      },
    ]);
    await markDownloadItemPaused(id1, '{"resumeData":"paused"}');
    await markDownloadItemCancelled(id2, '{"resumeData":"cancelled"}');

    const withoutCancelled = await getResumableDownloadItems();
    const withCancelled = await getResumableDownloadItems(true);

    expect(withoutCancelled.map(item => item.id)).toEqual([id1]);
    expect(withCancelled.map(item => item.id)).toEqual([id1, id2]);
    expect(withCancelled[0].resumeData).toBe('{"resumeData":"paused"}');
  });

  it('marks an item completed, sets progress to 1, and stores the file path', async () => {
    const [id] = await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Source Bible — Audio',
      },
    ]);

    await markDownloadItemCompleted(id, 'file:///downloads/1/x.mp3', 12345);

    const row = __getDownloadQueueRows().find(r => r.id === id);
    expect(row?.status).toBe('completed');
    expect(row?.progress).toBe(1);
    expect(row?.local_file_path).toBe('file:///downloads/1/x.mp3');
    expect(row?.bytes_total).toBe(12345);
  });

  it('marks an item failed without altering progress', async () => {
    const [id] = await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Source Bible — Audio',
      },
    ]);
    await markDownloadItemDownloading(id);
    await updateDownloadItemProgress(id, 0.5);

    await markDownloadItemFailed(id);

    const row = __getDownloadQueueRows().find(r => r.id === id);
    expect(row?.status).toBe('failed');
    expect(row?.progress).toBe(0.5);
  });

  it('deletes a queue row', async () => {
    const [id] = await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Source Bible — Audio',
      },
    ]);

    await deleteDownloadItem(id);

    expect(__getDownloadQueueRows()).toHaveLength(0);
  });

  it('snapshot excludes completed items but counts them toward completedCount/totalCount', async () => {
    const [id1, id2] = await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Source Bible — Audio',
      },
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 2,
        kind: 'text',
        resourceName: 'Translation Notes',
        label: 'Translation Notes — Text',
      },
    ]);
    await markDownloadItemCompleted(id1, 'file:///a.mp3');
    await markDownloadItemDownloading(id2);
    await updateDownloadItemProgress(id2, 0.3);

    const snapshot = await getDownloadQueueSnapshot();

    expect(snapshot.totalCount).toBe(2);
    expect(snapshot.completedCount).toBe(1);
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0].id).toBe(id2);
    expect(snapshot.items[0].status).toBe('downloading');
    expect(snapshot.primaryProjectId).toBe(1);
  });

  it('does not apply a stale progress update after the item is paused', async () => {
    const [id] = await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Source Bible — Audio',
      },
    ]);
    await markDownloadItemDownloading(id);
    await markDownloadItemPaused(id, 'resume-token');

    await updateDownloadItemProgress(id, 0.9);

    const row = __getDownloadQueueRows().find(r => r.id === id);
    expect(row?.progress).toBe(0);
  });

  it('does not apply a stale progress update after the item is cancelled', async () => {
    const [id] = await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Source Bible — Audio',
      },
    ]);
    await markDownloadItemDownloading(id);
    await markDownloadItemCancelled(id, 'resume-token');

    await updateDownloadItemProgress(id, 0.9);

    const row = __getDownloadQueueRows().find(r => r.id === id);
    expect(row?.progress).toBe(0);
  });

  it('allows progress to apply again once a failed item is explicitly reactivated for retry', async () => {
    const [id] = await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Source Bible — Audio',
      },
    ]);
    await markDownloadItemFailed(id);
    await updateDownloadItemProgress(id, 0.5); // should be ignored — still 'failed'
    const failedRow = __getDownloadQueueRows().find(r => r.id === id);

    expect(failedRow?.status).toBe('failed');
    expect(failedRow?.progress).toBe(0);

    await markDownloadItemDownloading(id);
    await updateDownloadItemProgress(id, 0.5); // now applies

    const row = __getDownloadQueueRows().find(r => r.id === id);
    expect(row?.status).toBe('downloading');
    expect(row?.progress).toBe(0.5);
  });

  it('snapshot aggregateProgress reflects completed + in-progress fractional credit', async () => {
    const [id1, id2] = await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Source Bible — Audio',
      },
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 2,
        kind: 'text',
        resourceName: 'Translation Notes',
        label: 'Translation Notes — Text',
      },
    ]);
    await markDownloadItemCompleted(id1, 'file:///a.mp3');
    await markDownloadItemDownloading(id2);
    await updateDownloadItemProgress(id2, 0.5);

    const snapshot = await getDownloadQueueSnapshot();

    // 1 completed (full credit) + 1 at 0.5 progress, across 2 total items.
    expect(snapshot.aggregateProgress).toBeCloseTo(0.75, 5);
  });

  it('snapshot returns zeroed defaults for an empty queue', async () => {
    const snapshot = await getDownloadQueueSnapshot();

    expect(snapshot.items).toEqual([]);
    expect(snapshot.totalCount).toBe(0);
    expect(snapshot.completedCount).toBe(0);
    expect(snapshot.aggregateProgress).toBe(0);
    expect(snapshot.primaryProjectId).toBeUndefined();
  });

  it('getDownloadedResourcesByProject only returns completed items for that project', async () => {
    const [id1] = await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Source Bible — Audio',
      },
    ]);
    const [id2] = await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 2,
        kind: 'text',
        resourceName: 'Translation Notes',
        label: 'Translation Notes — Text',
      },
    ]);
    const [id3] = await enqueueDownloadItems([
      {
        projectId: 2,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Source Bible — Audio',
      },
    ]);

    await markDownloadItemCompleted(id1, 'file:///p1-a.mp3');
    // id2 left queued/incomplete for project 1.
    await markDownloadItemCompleted(id3, 'file:///p2-a.mp3');

    const project1Downloaded = await getDownloadedResourcesByProject(
      1,
      TEST_USER_ID,
    );

    expect(project1Downloaded).toHaveLength(1);
    expect(project1Downloaded[0].id).toBe(id1);
    expect(project1Downloaded.some(r => r.id === id2)).toBe(false);
    expect(project1Downloaded.some(r => r.id === id3)).toBe(false);
  });

  it('getDownloadedResourcesByProject excludes completed rows owned by another user', async () => {
    const OTHER_USER_ID = 99;

    const [ownedId] = await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Source Bible — Audio',
      },
    ]);
    const [otherUserId] = await enqueueDownloadItems([
      {
        projectId: 1,
        userId: OTHER_USER_ID,
        tier: 1,
        kind: 'text',
        resourceName: 'Translation Notes',
        label: 'Translation Notes — Text',
      },
    ]);

    await markDownloadItemCompleted(ownedId, 'file:///owned.mp3');
    await markDownloadItemCompleted(otherUserId, 'file:///other.mp3');

    const projectDownloaded = await getDownloadedResourcesByProject(
      1,
      TEST_USER_ID,
    );

    expect(projectDownloaded).toHaveLength(1);
    expect(projectDownloaded[0].id).toBe(ownedId);
  });

  it('allows two users to enqueue the same active resource for the same project', async () => {
    const OTHER_USER_ID = 99;

    const [userOneId] = await enqueueDownloadItems([
      {
        id: 'user-7-source-bible-text',
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'text',
        resourceName: 'Source Bible',
        label: 'Source Bible — Text',
      },
    ]);
    const [userTwoId] = await enqueueDownloadItems([
      {
        id: 'user-99-source-bible-text',
        projectId: 1,
        userId: OTHER_USER_ID,
        tier: 1,
        kind: 'text',
        resourceName: 'Source Bible',
        label: 'Source Bible — Text',
      },
    ]);

    expect(userOneId).toBe('user-7-source-bible-text');
    expect(userTwoId).toBe('user-99-source-bible-text');
    expect(__getDownloadQueueRows()).toHaveLength(2);
  });

  it('groups completed inventory by project with byte totals', async () => {
    const [id1] = await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Source Bible — Audio',
      },
    ]);
    const [id2] = await enqueueDownloadItems([
      {
        projectId: 2,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'text',
        resourceName: 'Translation Notes',
        label: 'Translation Notes — Text',
      },
    ]);

    await markDownloadItemCompleted(id1, 'file:///p1-a.mp3', 100);
    await markDownloadItemCompleted(id2, 'file:///p2-a.txt', 250);

    const inventory = await getDownloadedResourcesInventory(TEST_USER_ID);

    expect(inventory).toEqual([
      expect.objectContaining({
        projectId: 1,
        totalBytes: 100,
        resources: [expect.objectContaining({ id: id1 })],
      }),
      expect.objectContaining({
        projectId: 2,
        totalBytes: 250,
        resources: [expect.objectContaining({ id: id2 })],
      }),
    ]);
  });

  it('getDownloadedResourcesInventory excludes completed rows owned by another user', async () => {
    const OTHER_USER_ID = 99;

    const [ownedId] = await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Source Bible — Audio',
      },
    ]);
    const [otherUserId] = await enqueueDownloadItems([
      {
        projectId: 2,
        userId: OTHER_USER_ID,
        tier: 1,
        kind: 'text',
        resourceName: 'Translation Notes',
        label: 'Translation Notes — Text',
      },
    ]);

    await markDownloadItemCompleted(ownedId, 'file:///owned.mp3', 100);
    await markDownloadItemCompleted(otherUserId, 'file:///other.mp3', 250);

    const inventory = await getDownloadedResourcesInventory(TEST_USER_ID);

    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toEqual(
      expect.objectContaining({
        projectId: 1,
        totalBytes: 100,
        resources: [expect.objectContaining({ id: ownedId })],
      }),
    );
  });

  it('does not revive a completed item if a stale progress update arrives late', async () => {
    const [id] = await enqueueDownloadItems([
      {
        projectId: 1,
        userId: TEST_USER_ID,
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        label: 'Source Bible — Audio',
      },
    ]);

    await markDownloadItemCompleted(id, 'file:///a.mp3');
    await updateDownloadItemProgress(id, 0.95);

    const row = __getDownloadQueueRows().find(r => r.id === id);
    expect(row?.status).toBe('completed');
    expect(row?.progress).toBe(1);
  });
});
