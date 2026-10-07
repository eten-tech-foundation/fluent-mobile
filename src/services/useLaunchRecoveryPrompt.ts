import { useEffect, useRef } from 'react';
import { Alert, InteractionManager } from 'react-native';
import { launchRecoveryGate } from './launchRecoveryGate';
import { collectLaunchRecoveries } from './pausedTakeLaunchRecovery';
import { clearPausedTake, type PausedTakeMarker } from './pausedTakes';
import { deleteFile } from '../utils/audioStorage';
import { logger } from '../utils/logger';

const log = logger.create('launchRecoveryPrompt');

type UseLaunchRecoveryPromptOptions = {
  /**
   * Navigate to the marker's verse; the take opens there paused. Resolve `true`
   * once navigation has been issued, `false` if the marker could not be routed
   * (bad IDs, missing assignment). A rejection counts as `false`.
   */
  onResume: (marker: PausedTakeMarker) => boolean | Promise<boolean>;
};

/**
 * Once per app launch, prompt for each recoverable paused take, one at a time
 * (#567). The alert is non-dismissable. Resume hands the marker to `onResume`;
 * if the resume fails, the prompt is shown again with Retry/Discard so the
 * user is never left without an answer. Markers not yet answered are prompted
 * again on the next launch or when their verse opens. Settles
 * {@link launchRecoveryGate} when the flow is finished.
 *
 * Discard settles the gate straight away (Home is still focused, so Prepare for
 * Offline may present). A successful Resume settles it only after the redirect
 * to the Record tab has finished, so Home is already blurred and Prepare for
 * Offline waits until the user returns to Home.
 */
export function useLaunchRecoveryPrompt({
  onResume,
}: UseLaunchRecoveryPromptOptions): void {
  const ranRef = useRef(false);
  const onResumeRef = useRef(onResume);
  onResumeRef.current = onResume;

  useEffect(() => {
    if (ranRef.current) {
      return;
    }
    ranRef.current = true;
    void (async () => {
      let queue: PausedTakeMarker[] = [];
      try {
        queue = await collectLaunchRecoveries();
      } catch (error) {
        log.warn('Launch recovery scan failed', { error });
        launchRecoveryGate.settle();
        return;
      }

      if (queue.length === 0) {
        launchRecoveryGate.settle();
        return;
      }

      const discard = (marker: PausedTakeMarker) => {
        clearPausedTake(marker.sessionKey);
        void Promise.all(
          marker.segments.map(uri =>
            deleteFile(uri).catch(error => {
              log.warn('Failed to delete discarded segment', { uri, error });
            }),
          ),
        );
      };

      const showNext = (index: number, resumeFailed = false) => {
        const marker = queue[index];
        if (!marker) {
          launchRecoveryGate.settle();
          return;
        }
        Alert.alert(
          'Recovered recording',
          resumeFailed
            ? "Couldn't open the recovered recording. Try again or discard it?"
            : 'A paused recording was recovered. Resume it or discard it?',
          [
            {
              text: 'Discard',
              style: 'destructive',
              onPress: () => {
                discard(marker);
                showNext(index + 1);
              },
            },
            {
              text: resumeFailed ? 'Retry' : 'Resume',
              onPress: () => {
                void (async () => {
                  let resumed = false;
                  try {
                    resumed = await onResumeRef.current(marker);
                  } catch (error) {
                    log.warn('Resume navigation failed', { error });
                  }
                  if (!resumed) {
                    // Keep Retry/Discard available; do not settle the gate.
                    showNext(index, true);
                    return;
                  }
                  // One resume per launch: remaining markers are not prompted
                  // here. They stay on disk and recover (RECOVER → paused)
                  // when their verse opens.
                  // Wait for the redirect to finish so screens gated on
                  // launchRecoveryGate see Home as blurred (#567).
                  InteractionManager.runAfterInteractions(() => {
                    launchRecoveryGate.settle();
                  });
                })();
              },
            },
          ],
          { cancelable: false },
        );
      };

      showNext(0);
    })();
  }, []);
}
