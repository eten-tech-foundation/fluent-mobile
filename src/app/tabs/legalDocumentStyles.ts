import { StyleSheet } from 'react-native';
import { theme } from '../../theme';

export const legalTextStyles = StyleSheet.create({
  title: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
    marginBottom: theme.spacing.lg,
  },
  paragraph: {
    fontSize: theme.typography.sizes.sm,
    lineHeight: theme.typography.lineHeights.normal,
    color: theme.colors.foreground,
    marginBottom: theme.spacing.lg,
  },
  paragraphBold: {
    fontWeight: theme.typography.weights.semibold,
  },
  bulletList: {
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  bulletMark: {
    fontSize: theme.typography.sizes.sm,
    lineHeight: theme.typography.lineHeights.normal,
    color: theme.colors.foreground,
  },
  bulletText: {
    flex: 1,
    fontSize: theme.typography.sizes.sm,
    lineHeight: theme.typography.lineHeights.normal,
    color: theme.colors.foreground,
  },
});
