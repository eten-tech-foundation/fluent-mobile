import { NULL_BIBLE_TEXT_ID_ROOT_CAUSE } from './bibleTextSyncGap';

describe('null bibleTextId root cause (#177)', () => {
  it('documents the incremental-sync gap', () => {
    expect(NULL_BIBLE_TEXT_ID_ROOT_CAUSE).toMatch(/incremental/i);
    expect(NULL_BIBLE_TEXT_ID_ROOT_CAUSE).toMatch(/zero local verses/i);
  });
});
