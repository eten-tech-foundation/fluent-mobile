import { RECORDINGS_JOIN_CA } from './queries';

describe('queries recordings join', () => {
  it('joins recordings through bible_texts for the chapter', () => {
    expect(RECORDINGS_JOIN_CA).toContain('r.bible_text_id = bt_r.id');
    expect(RECORDINGS_JOIN_CA).not.toContain('chapter_assignment_id');
  });
});
