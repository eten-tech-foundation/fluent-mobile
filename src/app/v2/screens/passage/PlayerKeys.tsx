import React from 'react';
import { HardwarePanel } from '../../../../components/ui/HardwarePanel';
import {
  EjectFill,
  PlayFill,
  RecordFill,
  SkipBackFill,
  SkipForwardFill,
} from '../../../../components/ui/icons';
import { Key } from '../../../../components/ui/Key';
import { ColorModeScope, useThemedStyles } from '../../../../theme/useTheme';

/**
 * The player's Hardware panel. Until playback and recording are wired, the
 * keys that would act open Legacy drafting at this passage.
 */
export function PlayerKeys({
  recordMode,
  onRecordModeChange,
  onOpenDrafting,
}: {
  recordMode: boolean;
  onRecordModeChange: (record: boolean) => void;
  onOpenDrafting: () => void;
}) {
  const styles = useThemedStyles(() => ({ key: { flex: 1 } }));
  return (
    <ColorModeScope value="hardware">
      <HardwarePanel
        recordMode={recordMode}
        onRecordModeChange={onRecordModeChange}
      >
        {recordMode ? (
          <>
            <Key
              icon={RecordFill}
              accessibilityLabel="Record in drafting"
              onPress={onOpenDrafting}
              style={styles.key}
            />
            <Key
              icon={PlayFill}
              accessibilityLabel="Play takes in drafting"
              onPress={onOpenDrafting}
              style={styles.key}
            />
            <Key
              icon={EjectFill}
              accessibilityLabel="Eject"
              disabled
              style={styles.key}
            />
          </>
        ) : (
          <>
            <Key
              icon={PlayFill}
              accessibilityLabel="Listen in drafting"
              onPress={onOpenDrafting}
              style={styles.key}
            />
            <Key
              icon={SkipBackFill}
              accessibilityLabel="Previous verse"
              disabled
              style={styles.key}
            />
            <Key
              icon={SkipForwardFill}
              accessibilityLabel="Next verse"
              disabled
              style={styles.key}
            />
          </>
        )}
      </HardwarePanel>
    </ColorModeScope>
  );
}
