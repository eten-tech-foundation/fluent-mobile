import React from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import FluentLogoWhite from '../../assets/icons/fluent-logo-white.svg';
import { theme, logoSize, headerLayout } from '../../theme';
import { useHeaderSafeAreaPadding } from './useHeaderSafeAreaPadding';

interface PageHeaderProps {
  title?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function PageHeader({ title, leftIcon, rightIcon }: PageHeaderProps) {
  const headerPadding = useHeaderSafeAreaPadding();

  return (
    <View style={[styles.container, headerPadding]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={theme.colors.primary}
      />
      <View style={styles.row}>
        <View style={styles.leftSlot}>{leftIcon}</View>

        <View style={styles.center} pointerEvents="none">
          {title ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : (
            <FluentLogoWhite
              width={logoSize.width}
              height={logoSize.height}
              style={styles.logo}
            />
          )}
        </View>

        <View style={styles.rightSlot}>{rightIcon}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: headerLayout.paddingHorizontal,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: headerLayout.minHeight,
  },
  leftSlot: {
    width: headerLayout.sideSlot,
    height: headerLayout.sideSlot,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -theme.spacing.sm,
  },
  rightSlot: {
    width: headerLayout.sideSlot,
    height: headerLayout.sideSlot,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
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
