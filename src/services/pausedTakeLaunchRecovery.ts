import { deleteFile, fileExists } from '../utils/audioStorage';
import { logger } from '../utils/logger';
import {
  clearPausedTake,
  listPausedTakes,
  type PausedTakeMarker,
} from './pausedTakes';
import { decideRecovery } from './pausedTakeRecovery';

const log = logger.create('pausedTakeLaunchRecovery');

/**
 * Scan every paused-take marker on app launch (#567).
 *
 * Returns the markers worth prompting for (carrying only surviving segments).
 * Orphaned markers and markers with no surviving segment files are removed along
 * with their files, keeping the #170 cleanup behavior.
 */
export async function collectLaunchRecoveries(): Promise<PausedTakeMarker[]> {
  const prompts: PausedTakeMarker[] = [];

  for (const marker of listPausedTakes()) {
    const existing = new Set<string>();
    await Promise.all(
      marker.segments.map(async uri => {
        if (await fileExists(uri)) {
          existing.add(uri);
        }
      }),
    );

    const decision = decideRecovery(marker, existing);
    if (decision.kind === 'prompt') {
      prompts.push(decision.marker);
      continue;
    }

    clearPausedTake(marker.sessionKey);
    await Promise.all(
      marker.segments.map(uri =>
        deleteFile(uri).catch(error => {
          log.warn('Failed to delete unrecoverable paused segment', {
            uri,
            error,
          });
        }),
      ),
    );
    log.info('Cleared unrecoverable paused take at launch', {
      sessionKey: marker.sessionKey,
      reason: decision.reason,
    });
  }

  return prompts;
}
