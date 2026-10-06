import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { launchRecoveryGate } from './launchRecoveryGate';
import { collectLaunchRecoveries } from '../services/pausedTakeLaunchRecovery';
import { clearPausedTake, type PausedTakeMarker } from './pausedTakes';
import { deleteFile } from '../utils/audioStorage';
import { logger } from '../utils/logger';

const log = logger.create('launchRecoveryPrompt');

type UseLaunchRecoveryPromptOptions = {
  /** Navigate to the marker's verse; the take opens there paused. */
  onResume: (marker: PausedTakeMarker) => void | Promise<void>;
};

/**
 * Once per app launch, prompt for each recoverable paused take, one at a time
 * (#567). The alert is non-dismissable. Resume hands the marker to `onResume`;
 * markers not yet answered are prompted again on the next launch or when their
 * verse opens. Settles {@link launchRecoveryGate} when the flow is finished.
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

      const showNext = (index: number) => {
        const marker = queue[index];
        if (!marker) {
          launchRecoveryGate.settle();
          return;
        }
        Alert.alert(
          'Recovered recording',
          'A paused recording was recovered. Resume it or discard it?',
          [
            {
              text: 'Discard',
              style: 'destructive',
              onPress: () => {
                clearPausedTake(marker.sessionKey);
                void Promise.all(
                  marker.segments.map(uri =>
                    deleteFile(uri).catch(error => {
                      log.warn('Failed to delete discarded segment', {
                        uri,
                        error,
                      });
                    }),
                  ),
                );
                showNext(index + 1);
              },
            },
            {
              text: 'Resume',
              onPress: () => {
                void Promise.resolve(onResumeRef.current(marker)).finally(
                  () => {
                    launchRecoveryGate.settle();
                  },
                );
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
