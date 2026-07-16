import { theme } from '../../theme';
import { StyleSheet, Text, View } from 'react-native';
import { SyncPageStatus } from '../../types/sync/types';

// Reserves vertical space for the buttons #151 will render:
//   syncing         -> Pause + Cancel                 (1 row)
//   paused          -> Resume, then Sync Now + Cancel  (2 rows)
//   pending         -> Sync Now (+ possible disabled-state caption) (1-2 rows)
//   uploadComplete  -> none
//   allComplete     -> none
// Heights are approximations from the mockups, not exact spec.

const ROW_HEIGHT = 52;
const ROW_GAP = theme.spacing.sm;

function reservedHeight(status: SyncPageStatus): number {
  switch (status) {
    case 'paused':
      return ROW_HEIGHT * 2 + ROW_GAP;
    case 'syncing':
    case 'pending':
      return ROW_HEIGHT;
    case 'uploadComplete':
    case 'allComplete':
    default:
      return 0;
  }
}

interface ActionControlsPlaceholderProps {
  status: SyncPageStatus;
}

export function ActionControlsPlaceholder({
  status,
}: ActionControlsPlaceholderProps) {
  const height = reservedHeight(status);

  if (height === 0) {
    return null;
  }

  return (
    <View style={[styles.container, { minHeight: height }]}>
      {__DEV__ && (
        <Text style={styles.devLabel}>Action controls — see #151</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: theme.spacing.sm,
    borderWidth: __DEV__ ? 1 : 0,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devLabel: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
});
