import { setDatabase } from './db';
import {
  resolveChapterClaimQueueEntry,
  setChapterAssignmentConflict,
} from './repository';

function createConflictTestDb() {
  const chapterAssignments = [{ id: 7, has_conflict: 0 }];
  const queueRows = [{ id: 3, chapter_assignment_id: 7 }];

  const execute = async (query: string, params: unknown[] = []) => {
    const sql = query.replace(/\s+/g, ' ').trim();

    if (sql.startsWith('UPDATE chapter_assignments SET has_conflict')) {
      const [hasConflict, id] = params as [number, number];
      const row = chapterAssignments.find(r => r.id === id);
      if (row) {
        row.has_conflict = hasConflict;
      }
      return { rows: [] };
    }

    if (sql.startsWith('DELETE FROM chapter_claim_queue')) {
      const [id] = params as [number];
      const index = queueRows.findIndex(r => r.id === id);
      if (index >= 0) {
        queueRows.splice(index, 1);
      }
      return { rows: [] };
    }

    return { rows: [] };
  };

  return {
    execute,
    transaction: async (
      fn: (tx: { execute: typeof execute }) => Promise<void>,
    ) => {
      await fn({ execute });
    },
    __chapterAssignments: chapterAssignments,
    __queueRows: queueRows,
  };
}

describe('setChapterAssignmentConflict', () => {
  it('updates has_conflict on the chapter assignment row', async () => {
    const db = createConflictTestDb();
    setDatabase(db as never);

    await setChapterAssignmentConflict(7, true);

    expect(db.__chapterAssignments[0]).toEqual({ id: 7, has_conflict: 1 });
  });
});

describe('resolveChapterClaimQueueEntry', () => {
  it('deletes the queue row once the claim outcome is known', async () => {
    const db = createConflictTestDb();
    setDatabase(db as never);

    await resolveChapterClaimQueueEntry(3);

    expect(db.__queueRows).toEqual([]);
  });
});
