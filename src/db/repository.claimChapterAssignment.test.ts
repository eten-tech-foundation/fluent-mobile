import { setDatabase } from './db';
import { claimChapterAssignment } from './repository';

type ChapterAssignmentRow = {
  id: number;
  assigned_user_id: number | null;
  updated_at: string;
};

function createClaimTestDb(initial: ChapterAssignmentRow[]) {
  const rows = [...initial];

  const execute = async (query: string, params: unknown[] = []) => {
    const sql = query.replace(/\s+/g, ' ').trim();
    if (sql.startsWith('UPDATE chapter_assignments SET assigned_user_id')) {
      const [userId, updatedAt, id] = params as [number, string, number];
      const row = rows.find(r => r.id === id);
      if (row) {
        row.assigned_user_id = userId;
        row.updated_at = updatedAt;
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
    __rows: rows,
  };
}

describe('claimChapterAssignment', () => {
  it('updates assigned_user_id and bumps updated_at', async () => {
    const db = createClaimTestDb([
      {
        id: 7,
        assigned_user_id: null,
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    setDatabase(db as never);

    await claimChapterAssignment(7, 42);

    expect(db.__rows[0]).toEqual(
      expect.objectContaining({
        id: 7,
        assigned_user_id: 42,
      }),
    );
    expect(db.__rows[0]!.updated_at).not.toBe('2026-01-01T00:00:00.000Z');
  });
});
