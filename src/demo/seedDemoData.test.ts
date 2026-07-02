import {
  clearAllSyncErrors,
  getDemoSeedVersion,
  setDemoSeedVersion,
  setLastAssignmentSyncAt,
  setLastSyncedAt,
  setSyncCount,
  setUserLastSyncedAt,
  setUserSync,
} from '../services/storage';
import {
  insertBibleTexts,
  insertChapterAssignmentSyncData,
  insertMasterData,
  insertProjects,
  insertUser,
  insertUserProjects,
} from '../db/repository';
import { seedDemoDataIfNeeded } from './seedDemoData';
import { DEMO_SEED_VERSION, DEMO_USER_ID } from './fixtures';

jest.mock('../db/repository', () => ({
  insertUser: jest.fn(() => Promise.resolve()),
  insertMasterData: jest.fn(() => Promise.resolve()),
  insertProjects: jest.fn(() => Promise.resolve()),
  insertChapterAssignmentSyncData: jest.fn(() => Promise.resolve()),
  insertUserProjects: jest.fn(() => Promise.resolve()),
  insertBibleTexts: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/storage', () => ({
  getDemoSeedVersion: jest.fn(() => 0),
  setDemoSeedVersion: jest.fn(),
  setUserSync: jest.fn(),
  setLastSyncedAt: jest.fn(),
  setLastAssignmentSyncAt: jest.fn(),
  setUserLastSyncedAt: jest.fn(),
  setSyncCount: jest.fn(),
  clearAllSyncErrors: jest.fn(),
  KV_KEYS: {
    SYNC_COUNT_PROJECTS: 'sync_count_projects',
    SYNC_COUNT_CHAPTERS: 'sync_count_chapters',
    SYNC_COUNT_BIBLES: 'sync_count_bibles',
  },
}));

describe('seedDemoDataIfNeeded', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getDemoSeedVersion as jest.Mock).mockReturnValue(0);
  });

  it('seeds demo data when seed version is missing', async () => {
    await seedDemoDataIfNeeded();

    expect(insertUser).toHaveBeenCalledTimes(1);
    expect(insertMasterData).toHaveBeenCalledTimes(1);
    expect(insertProjects).toHaveBeenCalledTimes(1);
    expect(insertChapterAssignmentSyncData).toHaveBeenCalledTimes(1);
    expect(insertUserProjects).toHaveBeenCalledWith(
      DEMO_USER_ID,
      expect.any(Array),
    );
    expect(insertBibleTexts).toHaveBeenCalledTimes(1);
    expect(setUserSync).toHaveBeenCalled();
    expect(setLastSyncedAt).toHaveBeenCalled();
    expect(setLastAssignmentSyncAt).toHaveBeenCalled();
    expect(setUserLastSyncedAt).toHaveBeenCalled();
    expect(setSyncCount).toHaveBeenCalled();
    expect(clearAllSyncErrors).toHaveBeenCalled();
    expect(setDemoSeedVersion).toHaveBeenCalledWith(DEMO_SEED_VERSION);
  });

  it('skips seeding when demo seed version is current', async () => {
    (getDemoSeedVersion as jest.Mock).mockReturnValue(DEMO_SEED_VERSION);

    await seedDemoDataIfNeeded();

    expect(insertUser).not.toHaveBeenCalled();
    expect(setDemoSeedVersion).not.toHaveBeenCalled();
  });
});
