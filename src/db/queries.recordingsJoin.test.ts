import { RECORDINGS_JOIN_CA } from './queries';

jest.mock('../services/storage', () => ({
  getActiveUserId: () => '1',
  getUserIdSync: () => '1',
}));

describe('queries recordings join', () => {
  it('joins recordings through bible_texts for the chapter', () => {
    expect(RECORDINGS_JOIN_CA).toContain('r.bible_text_id = bt_r.id');
    expect(RECORDINGS_JOIN_CA).not.toContain('chapter_assignment_id');
  });

  it('scopes latest recordings to recorded_by_user_id (#105)', () => {
    expect(RECORDINGS_JOIN_CA).toContain('r.recorded_by_user_id = ?');
  });
});
