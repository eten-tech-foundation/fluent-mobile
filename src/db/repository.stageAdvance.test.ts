import { setDatabase } from './db';
import { updateChapterAssignmentStatusLocally } from './repository';

type ChapterAssignmentRow = {
  id: number;
  status: string;
  peer_checker_id: number | null;
  submitted_time: string | null;
  updated_at: string;
};

function createStageAdvanceTestDb(initial: ChapterAssignmentRow[]) {
  const rows = [...initial];

  const execute = async (query: string, params: unknown[] = []) => {
    const sql = query.replace(/\s+/g, ' ').trim();
    if (sql.includes('peer_checker_id = ?')) {
      const [status, submittedTime, updatedAt, peerCheckerId, id] = params as [
        string,
        string,
        string,
        number,
        number,
      ];
      const row = rows.find(r => r.id === id);
      if (row) {
        row.status = status;
        row.submitted_time = submittedTime;
        row.updated_at = updatedAt;
        row.peer_checker_id = peerCheckerId;
      }
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE chapter_assignments SET status = ?')) {
      const [status, submittedTime, updatedAt, id] = params as [
        string,
        string,
        string,
        number,
      ];
      const row = rows.find(r => r.id === id);
      if (row) {
        row.status = status;
        row.submitted_time = submittedTime;
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

describe('updateChapterAssignmentStatusLocally', () => {
  it('updates status without clearing peer_checker_id', async () => {
    const db = createStageAdvanceTestDb([
      {
        id: 7,
        status: 'draft',
        peer_checker_id: 20,
        submitted_time: null,
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    setDatabase(db as never);

    await updateChapterAssignmentStatusLocally(7, 'peer_check');

    expect(db.__rows[0]).toEqual(
      expect.objectContaining({
        status: 'peer_check',
        peer_checker_id: 20,
      }),
    );
  });

  it('sets peer_checker_id when assigning on Community Review advance', async () => {
    const db = createStageAdvanceTestDb([
      {
        id: 7,
        status: 'peer_check',
        peer_checker_id: null,
        submitted_time: null,
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    setDatabase(db as never);

    await updateChapterAssignmentStatusLocally(7, 'community_review', 99);

    expect(db.__rows[0]).toEqual(
      expect.objectContaining({
        status: 'community_review',
        peer_checker_id: 99,
      }),
    );
  });
});
