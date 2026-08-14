import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import FluentLogoWhite from '../../assets/icons/fluent-logo-white.svg';
import { theme, logoSize, headerLayout } from '../../theme';
import { AppHeader } from './AppHeader';

interface PageHeaderProps {
  title?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function PageHeader({ title, leftIcon, rightIcon }: PageHeaderProps) {
  return (
    <AppHeader
      tone="primary"
      border="none"
      titleAlign="center"
      left={<View style={styles.leftSlot}>{leftIcon}</View>}
      right={<View style={styles.rightSlot}>{rightIcon}</View>}
      center={
        title ? (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          <FluentLogoWhite
            width={logoSize.width}
            height={logoSize.height}
            style={styles.logo}
          />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
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
  logo: {
    marginVertical: logoSize.marginVertical,
  },
  title: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primaryForeground,
    includeFontPadding: false,
  },
});
