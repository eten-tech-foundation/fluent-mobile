import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { AppHeader, HeaderBackButton } from './AppHeader';
import { StackScreenHeader } from './StackScreenHeader';
import { ListCard } from '../ui/ListCard';
import { ColorModeScope } from '../../theme/useTheme';
import { resolveTheme, type ColorMode } from '../../theme';
import { getAllByHostType } from '../../test/hostElements';

jest.mock('../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const noop = () => {};
const tree = (mode: ColorMode) => (
  <ColorModeScope value={mode}>
    <AppHeader title="Header" tone="primary" />
    <HeaderBackButton onPress={noop} testID="standalone-back" />
    <StackScreenHeader title="Stack" onBack={noop} />
    <ListCard testID="card" onPress={noop}>
      <Text>Card</Text>
    </ListCard>
  </ColorModeScope>
);

function headerShells() {
  const shells = getAllByHostType('View')
    .map(node => StyleSheet.flatten(node.props.style))
    .filter(style => style?.borderBottomColor !== undefined);
  expect(shells).toHaveLength(2);
  return shells;
}

describe('shared chrome follows the color mode', () => {
  it('recomputes header and card styles when the scope changes mode', async () => {
    const hardware = resolveTheme('hardware');
    const canvas = resolveTheme('canvas');
    expect(hardware.colors.background).not.toBe(canvas.colors.background);
    expect(hardware.colors.cardBackground).not.toBe(
      canvas.colors.cardBackground,
    );

    const { rerender } = await render(tree('hardware'));
    expect(headerShells().map(style => style.backgroundColor)).toEqual([
      hardware.colors.primary,
      hardware.colors.cardBackground,
    ]);
    expect(screen.getByTestId('card')).toHaveStyle({
      backgroundColor: hardware.listCard.backgroundColor,
    });
    expect(screen.getByTestId('standalone-back')).toHaveStyle({
      borderRadius: hardware.radius.full,
    });

    await rerender(tree('canvas'));
    expect(headerShells().map(style => style.backgroundColor)).toEqual([
      canvas.colors.primary,
      canvas.colors.cardBackground,
    ]);
    expect(screen.getByTestId('card')).toHaveStyle({
      backgroundColor: canvas.listCard.backgroundColor,
    });
    expect(screen.getByTestId('standalone-back')).toHaveStyle({
      borderRadius: canvas.radius.full,
    });
    expect(screen.getByTestId('stack-header-back')).toHaveStyle({
      borderRadius: canvas.radius.full,
    });

    await rerender(tree('hardware'));
    expect(headerShells().map(style => style.backgroundColor)).toEqual([
      hardware.colors.primary,
      hardware.colors.cardBackground,
    ]);
    expect(screen.getByTestId('card')).toHaveStyle({
      backgroundColor: hardware.listCard.backgroundColor,
    });
  });
});
