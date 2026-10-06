import type { AppStateStatus } from 'react-native';
import { logger } from '../utils/logger';
import type { RecordingEngine } from './createRecordingEngine';

const log = logger.create('recordingAppState');

type AppStateEngine = Pick<
  RecordingEngine,
  'getStatus' | 'pause' | 'syncPausedNativeState'
>;

/**
 * AppState policy for the recording engine (#567, #49, #486).
 *
 * - `background` while recording -> pause. When `requestPause` is supplied the
 *   host runs the same pause path as the Pause button (marker write + UI
 *   state), so the two can never diverge.
 * - `active` -> re-sync native paused state (#486): expo-audio's Android
 *   module can resume a paused recorder when the activity returns.
 *
 * `inactive` is intentionally ignored: it is iOS-only and also fires for
 * transient interruptions (control center, system dialogs).
 */
export function handleRecordingAppStateChange(
  engine: AppStateEngine,
  nextState: AppStateStatus,
  requestPause?: () => void,
): void {
  if (nextState === 'active') {
    engine.syncPausedNativeState();
    return;
  }

  if (nextState !== 'background' || engine.getStatus() !== 'recording') {
    return;
  }

  // A host that owns pause side effects (paused-take marker, UI state) runs its
  // own pause path; otherwise the engine pauses itself (#567).
  if (requestPause) {
    requestPause();
    return;
  }

  engine.pause().catch(error => {
    log.warn('Auto-pause on background failed', { error });
  });
}
