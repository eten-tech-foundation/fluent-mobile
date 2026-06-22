import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import FluentLogoWhite from '../../assets/icons/fluent-logo-white.svg';
import { theme, logoSize, headerLayout } from '../../theme';

interface PageHeaderProps {
  title?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function PageHeader({ title, leftIcon, rightIcon }: PageHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.leftSlot}>{leftIcon}</View>

      <View style={styles.rightSlot}>{rightIcon}</View>

      {title ? (
        <View style={styles.centerOverlay} pointerEvents="none">
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
      ) : (
        <View style={styles.centerOverlay} pointerEvents="none">
          <FluentLogoWhite
            width={logoSize.width}
            height={logoSize.height}
            style={styles.logo}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: headerLayout.paddingHorizontal,
    paddingVertical: headerLayout.paddingVertical,
    minHeight: headerLayout.minHeight,
  },
  leftSlot: {
    width: headerLayout.sideSlot,
    height: headerLayout.sideSlot,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -theme.spacing.sm,
    zIndex: 1,
  },
  rightSlot: {
    width: headerLayout.sideSlot,
    height: headerLayout.sideSlot,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    marginVertical: logoSize.marginVertical,
  },
  title: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primaryForeground,
  },
});
