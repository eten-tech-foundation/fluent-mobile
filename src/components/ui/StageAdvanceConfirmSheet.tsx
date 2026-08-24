import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../theme';

export type StageAdvanceConfirmSheetProps = {
  visible: boolean;
  chapterName: string;
  bodyText: string;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function StageAdvanceConfirmSheet({
  visible,
  chapterName,
  bodyText,
  submitting = false,
  onCancel,
  onConfirm,
}: StageAdvanceConfirmSheetProps) {
  const insets = useSafeAreaInsets();
  const sheetStyle = useMemo(
    () => ({
      paddingBottom: insets.bottom + theme.spacing.lg,
    }),
    [insets.bottom],
  );

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable
        style={styles.backdrop}
        onPress={submitting ? undefined : onCancel}
        testID="stage-advance-sheet-backdrop"
      >
        <Pressable
          onPress={event => event.stopPropagation()}
          style={[styles.sheet, sheetStyle]}
          testID="stage-advance-confirm-sheet"
        >
          <Text style={styles.title} testID="stage-advance-sheet-title">
            {chapterName}
          </Text>
          <Text style={styles.body} testID="stage-advance-sheet-body">
            {bodyText}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.primaryButton, submitting && styles.disabled]}
              onPress={onConfirm}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Send"
              testID="stage-advance-send"
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.primaryForeground} />
              ) : (
                <Text style={styles.primaryLabel}>Send</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onCancel}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              testID="stage-advance-cancel"
            >
              <Text style={styles.secondaryLabel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: theme.colors.drawerOverlay,
  },
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    borderColor: theme.colors.border,
    borderTopWidth: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
  },
  body: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.mutedForeground,
    lineHeight: 22,
  },
  actions: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
  },
  primaryLabel: {
    color: theme.colors.primaryForeground,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
  },
  secondaryLabel: {
    color: theme.colors.foreground,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.medium,
  },
  disabled: {
    opacity: 0.6,
  },
});
