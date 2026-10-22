import {
  MY_WORK_CHAPTER_STATUSES,
  getMyWorkChapterQueryParams,
} from './myWorkChapterFilter';

describe('myWorkChapterFilter', () => {
  it('binds not_started and draft to assignee and peer_check to peer checker', () => {
    expect(getMyWorkChapterQueryParams(42)).toEqual([
      MY_WORK_CHAPTER_STATUSES.NOT_STARTED,
      MY_WORK_CHAPTER_STATUSES.DRAFT,
      42,
      MY_WORK_CHAPTER_STATUSES.PEER_CHECK,
      42,
    ]);
  });
});
