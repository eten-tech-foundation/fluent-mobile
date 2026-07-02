import {
  insertBibleTexts,
  insertChapterAssignmentSyncData,
  insertMasterData,
  insertProjects,
  insertUser,
  insertUserProjects,
} from '../db/repository';
import { logger } from '../utils/logger';
import {
  clearAllSyncErrors,
  getDemoSeedVersion,
  kvStorage,
  KV_KEYS,
  setDemoSeedVersion,
  setLastAssignmentSyncAt,
  setLastSyncedAt,
  setSyncCount,
  setUserLastSyncedAt,
  setUserSync,
} from '../services/storage';
import {
  DEMO_SEED_VERSION,
  DEMO_USER_ID,
  demoBibleTexts,
  demoBibles,
  demoBooks,
  demoChapterAssignments,
  demoLanguages,
  demoProjectIds,
  demoProjects,
  demoUser,
} from './fixtures';

const log = logger.create('DemoSeed');

function isDemoSeedCurrent(): boolean {
  return getDemoSeedVersion() === DEMO_SEED_VERSION;
}

export async function seedDemoDataIfNeeded(): Promise<void> {
  if (isDemoSeedCurrent()) {
    log.info('Demo seed already applied', { version: DEMO_SEED_VERSION });
    return;
  }

  log.info('Seeding demo data', { version: DEMO_SEED_VERSION });

  await insertUser(demoUser);
  await insertMasterData(demoLanguages, demoBooks, demoBibles);
  await insertProjects(demoProjects);
  await insertChapterAssignmentSyncData(demoChapterAssignments);
  await insertUserProjects(DEMO_USER_ID, demoProjectIds);
  await insertBibleTexts(demoBibleTexts);

  const syncedAt = new Date().toISOString();
  setUserSync(String(DEMO_USER_ID), demoUser.email);
  setLastSyncedAt(syncedAt);
  setLastAssignmentSyncAt(syncedAt);
  setUserLastSyncedAt(String(DEMO_USER_ID), syncedAt);
  setSyncCount(KV_KEYS.SYNC_COUNT_PROJECTS, demoProjectIds.length);
  setSyncCount(KV_KEYS.SYNC_COUNT_CHAPTERS, demoChapterAssignments.length);
  setSyncCount(KV_KEYS.SYNC_COUNT_BIBLES, demoBibles.length);
  clearAllSyncErrors();
  setDemoSeedVersion(DEMO_SEED_VERSION);

  log.info('Demo seed completed', {
    userId: DEMO_USER_ID,
    projects: demoProjectIds.length,
    chapters: demoChapterAssignments.length,
  });
}

/** Clears the seed marker so the next launch re-applies fixtures. */
export function resetDemoSeedMarker(): void {
  kvStorage.removeItemSync(KV_KEYS.DEMO_SEED_VERSION);
}
