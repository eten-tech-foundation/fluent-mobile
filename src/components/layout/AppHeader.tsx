import React from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ColorValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { theme } from '../../theme';
import {
  headerLayout,
  iconSizes,
  listIconStrokeWidth,
  touchHitSlop,
} from '../../theme/iconSpecs';
import { useHeaderSafeAreaPadding } from './useHeaderSafeAreaPadding';

export type AppHeaderTone = 'primary' | 'surface' | 'plain';

const TONE = {
  primary: {
    backgroundColor: theme.colors.primary,
    titleColor: theme.colors.primaryForeground,
    statusBar: 'light-content' as const,
  },
  surface: {
    backgroundColor: theme.colors.cardBackground,
    titleColor: theme.colors.foreground,
    statusBar: 'dark-content' as const,
  },
  plain: {
    backgroundColor: theme.colors.background,
    titleColor: theme.colors.foreground,
    statusBar: 'dark-content' as const,
  },
} as const;

interface HeaderBackButtonProps {
  onPress: () => void;
  color?: ColorValue;
  testID?: string;
  activeOpacity?: number;
}

/** Shared chevron back control for all app headers. */
export function HeaderBackButton({
  onPress,
  color = theme.colors.foreground,
  testID,
  activeOpacity = 0.7,
}: HeaderBackButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={touchHitSlop}
      style={styles.backButton}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      activeOpacity={activeOpacity}
      testID={testID}
    >
      <ChevronLeft
        size={iconSizes.header}
        color={color}
        strokeWidth={listIconStrokeWidth}
      />
    </TouchableOpacity>
  );
}

interface AppHeaderProps {
  tone?: AppHeaderTone;
  title?: string;
  subtitle?: string;
  subtitleLines?: number;
  /** `center` true-centers in the content row (safe below status bar). */
  titleAlign?: 'start' | 'center';
  left?: React.ReactNode;
  right?: React.ReactNode;
  /** Replaces the default title node (e.g. logo). */
  center?: React.ReactNode;
  border?: 'none' | 'hairline' | 'solid';
  style?: StyleProp<ViewStyle>;
}

/**
 * Single header chrome: status-bar padding on the outer shell, content in an
 * inner row. Never absolute-center over the status-bar inset.
 */
export function AppHeader({
  tone = 'surface',
  title,
  subtitle,
  subtitleLines = 1,
  titleAlign = 'start',
  left,
  right,
  center,
  border = 'solid',
  style,
}: AppHeaderProps) {
  const headerPadding = useHeaderSafeAreaPadding();
  const palette = TONE[tone];
  const centered = titleAlign === 'center';

  const titleNode =
    center ??
    (title ? (
      <View style={[styles.titles, !centered && styles.titlesStart]}>
        <Text
          style={[styles.title, { color: palette.titleColor }]}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={subtitleLines}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    ) : null);

  return (
    <View
      style={[
        styles.outer,
        headerPadding,
        {
          backgroundColor: palette.backgroundColor,
          borderBottomWidth:
            border === 'none'
              ? 0
              : border === 'hairline'
              ? StyleSheet.hairlineWidth
              : 1,
          borderBottomColor: theme.colors.border,
        },
        style,
      ]}
    >
      <StatusBar
        barStyle={palette.statusBar}
        backgroundColor={palette.backgroundColor}
      />
      <View style={[styles.row, centered && styles.rowCentered]}>
        <View style={centered ? styles.sideSlot : styles.leading}>{left}</View>

        {centered ? (
          <View style={styles.centerOverlay} pointerEvents="none">
            {titleNode}
          </View>
        ) : (
          <View style={styles.startTitle}>{titleNode}</View>
        )}

        <View style={centered ? styles.trailingSlot : styles.trailing}>
          {right}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    paddingHorizontal: headerLayout.paddingHorizontal,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: headerLayout.minHeight,
    gap: theme.spacing.md,
  },
  rowCentered: {
    position: 'relative',
    justifyContent: 'space-between',
    gap: 0,
  },
  leading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideSlot: {
    width: headerLayout.sideSlot,
    height: headerLayout.sideSlot,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  trailingSlot: {
    minWidth: headerLayout.sideSlot,
    height: headerLayout.sideSlot,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.md,
    zIndex: 1,
  },
  trailing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Absolute only within the content row — below status-bar padding. */
  centerOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startTitle: {
    flex: 1,
    justifyContent: 'center',
  },
  titles: {
    gap: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titlesStart: {
    alignItems: 'flex-start',
    alignSelf: 'stretch',
  },
  title: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    includeFontPadding: false,
  },
  subtitle: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.mutedForeground,
    includeFontPadding: false,
  },
  backButton: {
    borderRadius: theme.radius.full,
    padding: theme.spacing.xs,
  },
});
