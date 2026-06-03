import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useSync } from '../../hooks/useSync';
import { theme } from '../../theme';

interface SyncButtonProps {
  onSyncComplete?: () => void;
  style?: StyleProp<ViewStyle>;
  onSyncStart?: () => void;
}

function getStateColors(stateType: ReturnType<typeof useSync>['stateType']) {
  switch (stateType) {
    case 'syncing':
      return {
        backgroundColor: '#e6f1fb',
        borderColor: '#b5d4f4',
        textColor: theme.colors.primary,
      };
    case 'error':
      return {
        backgroundColor: '#fcebeb',
        borderColor: '#f7c1c1',
        textColor: theme.colors.destructive,
      };
    case 'never':
    case 'normal':
    default:
      return {
        backgroundColor: theme.colors.background,
        borderColor: theme.colors.border,
        textColor: theme.colors.mutedForeground,
      };
  }
}

export function SyncButton({
  onSyncComplete,
  style,
  onSyncStart,
}: SyncButtonProps) {
  const { stateType, displayText, isSyncing, triggerSync } = useSync({
    onSyncComplete,
    onSyncStart,
  });

  const colors = getStateColors(stateType);

  return (
    <View
      style={[
        styles.container,
        style,
        {
          backgroundColor: colors.backgroundColor,
          borderColor: colors.borderColor,
        },
      ]}
    >
      <View style={styles.content}>
        <Text style={[styles.text, { color: colors.textColor }]}>
          {displayText}
        </Text>
      </View>

      <TouchableOpacity
        onPress={triggerSync}
        disabled={isSyncing}
        activeOpacity={0.7}
        style={styles.syncButton}
      >
        {isSyncing ? (
          <ActivityIndicator size="small" color={colors.textColor} />
        ) : (
          <Ionicons name="refresh" size={20} color={colors.textColor} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    marginBottom: theme.spacing.sm,
  },
  content: {
    flex: 1,
  },
  text: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
  },
  syncButton: {
    padding: theme.spacing.sm,
    marginLeft: theme.spacing.md,
  },
});
