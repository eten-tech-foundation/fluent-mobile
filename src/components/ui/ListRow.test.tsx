import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ListRow } from './ListRow';
import { Gear } from './icons';
import { resolveTheme } from '../../theme';
import { UiVersionOverride } from '../../theme/useTheme';

jest.mock('../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));

const next = resolveTheme('next');

function renderNext(ui: React.ReactElement) {
  return render(<UiVersionOverride value="next">{ui}</UiVersionOverride>);
}

describe('ListRow', () => {
  it('speaks its title and subtitle and opens on press', () => {
    const onPress = jest.fn();
    renderNext(
      <ListRow
        icon={Gear}
        title="Add account"
        subtitle="2 of 3 on this device"
        onPress={onPress}
      />,
    );

    fireEvent.press(
      screen.getByRole('button', {
        name: 'Add account, 2 of 3 on this device',
      }),
    );
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(
      StyleSheet.flatten(screen.getByText('2 of 3 on this device').props.style)
        .color,
    ).toBe(next.roles.fgSecondary);
  });

  it("can't be pressed when disabled", () => {
    const onPress = jest.fn();
    renderNext(<ListRow title="Add account" disabled onPress={onPress} />);

    const row = screen.getByRole('button', { name: 'Add account' });
    expect(row.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(row);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('marks the selected row, and holds a leading and trailing view', () => {
    renderNext(
      <ListRow
        title="Jordan Smith"
        leading={<Text>JS</Text>}
        trailing={<Text>✓</Text>}
        selected
        onPress={jest.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Jordan Smith' }).props
        .accessibilityState,
    ).toMatchObject({ selected: true });
    expect(screen.getByText('JS')).toBeTruthy();
    expect(screen.getByText('✓')).toBeTruthy();
  });

  it('is not a button without a press, leaving it to its control', () => {
    renderNext(
      <ListRow title="Upload over cellular" trailing={<Text>on</Text>} />,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Upload over cellular')).toBeTruthy();
  });
});
