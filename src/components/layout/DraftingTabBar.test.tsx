import React from 'react';
import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { theme } from '../../theme';
import { DraftingTabBar } from './DraftingTabBar';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 16, left: 0 }),
}));

describe('DraftingTabBar', () => {
  it('renders Bible, Resources, Record in Lovable order with active top indicator', () => {
    const onTabChange = jest.fn();
    render(<DraftingTabBar activeTab="record" onTabChange={onTabChange} />);

    const bar = screen.getByTestId('drafting-tab-bar');
    expect(bar).toHaveStyle({
      backgroundColor: theme.colors.tabBarBackground,
    });
    const tabs = within(bar).getAllByRole('tab');
    expect(tabs.map(t => t.props.accessibilityLabel)).toEqual([
      'Bible',
      'Resources',
      'Record',
    ]);
    expect(tabs[2]?.props.accessibilityState?.selected).toBe(true);

    fireEvent.press(screen.getByLabelText('Resources'));
    expect(onTabChange).toHaveBeenCalledWith('resources');
  });
});
