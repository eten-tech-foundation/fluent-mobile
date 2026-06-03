import { rawColors } from './tokens';

export const colors = {
  primary: rawColors.primary,
  primaryForeground: rawColors.primaryForeground,
  background: rawColors.background,
  foreground: rawColors.foreground,
  cardBackground: rawColors.cardBackground,
  mutedForeground: rawColors.mutedForeground,
  border: rawColors.border,
  syncSynced: rawColors.syncSynced,
  syncUnsynced: rawColors.syncUnsynced,
  syncOffline: rawColors.syncOffline,
  destructive: rawColors.destructive,
  tabInactive: rawColors.tabInactive,
} as const;

export type Colors = typeof colors;
