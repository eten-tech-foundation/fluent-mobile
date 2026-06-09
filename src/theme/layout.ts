import { ViewStyle } from 'react-native';
import { colors, radius, spacing } from './tokens';

/** Scrollable home tab list (`overflow-y-auto px-4 py-4`, `gap-2`). */
export const homeListContent: ViewStyle = {
  padding: spacing.lg,
  gap: spacing.sm,
};

/** Shared list row card (`rounded-lg`, `px-4 py-3`, `gap-3`, `bg-card`). */
export const listCard = {
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.md,
  gap: spacing.md,
  borderRadius: radius.sm,
  backgroundColor: colors.cardBackground,
  borderColor: colors.border,
  activeOpacity: 0.95,
} as const;

/** Workflow pill (`px-2.5 py-0.5`, `border-2` in mock). */
export const workflowBadge = {
  borderWidth: 2,
  paddingHorizontal: 10,
  paddingVertical: 2,
} as const;
