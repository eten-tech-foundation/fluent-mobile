import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { AppHeader, HeaderBackButton } from './AppHeader';
import { StackScreenHeader } from './StackScreenHeader';
import { ListCard } from '../ui/ListCard';
import { UiVersionOverride } from '../../theme/useTheme';
import { legacyTheme } from '../../theme/legacy';
import { resolveTheme } from '../../theme/uiVersion';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const nextTheme = resolveTheme('next');
const noop = () => {};
const tree = (version: 'legacy' | 'next') => (
  <UiVersionOverride value={version}>
    <AppHeader title="Header" tone="primary" />
    <HeaderBackButton onPress={noop} testID="standalone-back" />
    <StackScreenHeader title="Stack" onBack={noop} />
    <ListCard testID="card" onPress={noop}>
      <Text>Card</Text>
    </ListCard>
  </UiVersionOverride>
);

function headerShells() {
  const shells = screen
    .UNSAFE_getAllByType(View)
    .map(node => StyleSheet.flatten(node.props.style))
    .filter(style => style?.borderBottomColor !== undefined);
  expect(shells).toHaveLength(2);
  return shells;
}

describe('shared chrome follows the scoped theme', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferenceStore();
  });

  it('preserves Legacy values and picks up independently changed Next tokens at runtime', () => {
    const nextColors = nextTheme.colors as {
      primary: string;
      cardBackground: string;
      foreground: string;
    };
    const nextLayout = nextTheme.headerLayout as {
      paddingHorizontal: number;
      paddingVertical: number;
    };
    const nextCard = nextTheme.listCard as { backgroundColor: string };
    const nextRadius = nextTheme.radius as { full: number };
    const original = {
      primary: nextColors.primary,
      cardBackground: nextColors.cardBackground,
      foreground: nextColors.foreground,
      padding: nextLayout.paddingHorizontal,
      verticalPadding: nextLayout.paddingVertical,
      card: nextCard.backgroundColor,
      radius: nextRadius.full,
    };
    try {
      nextColors.primary = '#123456';
      nextColors.cardBackground = '#654321';
      nextColors.foreground = '#345678';
      nextLayout.paddingHorizontal = 29;
      nextLayout.paddingVertical = 23;
      nextCard.backgroundColor = '#abcdef';
      nextRadius.full = 37;
      const { rerender } = render(tree('legacy'));
      expect(headerShells().map(style => style.backgroundColor)).toEqual([
        legacyTheme.colors.primary,
        legacyTheme.colors.cardBackground,
      ]);
      expect(screen.getByTestId('card')).toHaveStyle({
        backgroundColor: legacyTheme.listCard.backgroundColor,
      });
      expect(screen.getByTestId('standalone-back')).toHaveStyle({
        borderRadius: legacyTheme.radius.full,
      });

      rerender(tree('next'));
      expect(headerShells().map(style => style.backgroundColor)).toEqual([
        '#123456',
        '#654321',
      ]);
      expect(
        headerShells().every(style => style.paddingHorizontal === 29),
      ).toBe(true);
      expect(
        headerShells().every(
          style => style.paddingTop === 23 && style.paddingBottom === 23,
        ),
      ).toBe(true);
      expect(screen.getByTestId('card')).toHaveStyle({
        backgroundColor: '#abcdef',
      });
      expect(screen.getByTestId('standalone-back')).toHaveStyle({
        borderRadius: 37,
      });
      expect(screen.getByTestId('stack-header-back')).toHaveStyle({
        borderRadius: 37,
      });

      rerender(tree('legacy'));
      expect(headerShells().map(style => style.backgroundColor)).toEqual([
        legacyTheme.colors.primary,
        legacyTheme.colors.cardBackground,
      ]);
      expect(screen.getByTestId('card')).toHaveStyle({
        backgroundColor: legacyTheme.listCard.backgroundColor,
      });
    } finally {
      nextColors.primary = original.primary;
      nextColors.cardBackground = original.cardBackground;
      nextColors.foreground = original.foreground;
      nextLayout.paddingHorizontal = original.padding;
      nextLayout.paddingVertical = original.verticalPadding;
      nextCard.backgroundColor = original.card;
      nextRadius.full = original.radius;
    }
  });
});
