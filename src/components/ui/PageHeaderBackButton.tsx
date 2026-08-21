import React from 'react';
import { theme } from '../../theme';
import { HeaderBackButton } from '../layout/AppHeader';

interface PageHeaderBackButtonProps {
  onPress: () => void;
}

/** @deprecated Prefer HeaderBackButton — kept for existing call sites/tests. */
export function PageHeaderBackButton({ onPress }: PageHeaderBackButtonProps) {
  return (
    <HeaderBackButton
      onPress={onPress}
      color={theme.colors.primaryForeground}
    />
  );
}
