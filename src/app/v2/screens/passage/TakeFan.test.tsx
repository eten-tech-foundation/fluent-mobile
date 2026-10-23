import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { fanPlacement, TakeFan } from './TakeFan';
import { mockPreferenceStore } from '../../../../test/mocks/preferenceStore';

jest.mock('../../../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));

describe('fanPlacement', () => {
  it('peeks each step out past the one in front, as in Figma', () => {
    expect(fanPlacement(0)).toEqual({ x: 0, scale: 1, visible: true });
    // Figma: Take 4 sits at x 123, 66 wide, beside the front at 166–246.
    expect(fanPlacement(-1).x).toBeCloseTo(123 + 33 - 206);
    expect(fanPlacement(1).x).toBeCloseTo(-fanPlacement(-1).x);
    expect(fanPlacement(5).visible).toBe(false);
  });
});

describe('TakeFan', () => {
  beforeEach(() => mockPreferenceStore());

  it('brings a take to the front when tapped and marks the official one', () => {
    const onSelect = jest.fn();
    render(
      <TakeFan
        takes={[
          { id: 'a', takeNumber: 1, official: true },
          { id: 'b', takeNumber: 2, official: false },
        ]}
        frontId="b"
        onSelect={onSelect}
      />,
    );

    expect(screen.getByLabelText('Take 2, selected')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Take 1, official'));
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it("doesn't select the take still being recorded", () => {
    const onSelect = jest.fn();
    render(
      <TakeFan
        takes={[
          { id: 'recording', takeNumber: 3, official: false, recording: true },
        ]}
        frontId="recording"
        onSelect={onSelect}
      />,
    );

    fireEvent.press(screen.getByLabelText('Take 3, recording'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ends with an empty dashed slot for the next take', () => {
    const onSelect = jest.fn();
    render(
      <TakeFan
        takes={[
          { id: 'a', takeNumber: 1, official: false },
          {
            id: 'placeholder',
            takeNumber: 2,
            official: false,
            placeholder: true,
          },
        ]}
        frontId="a"
        onSelect={onSelect}
      />,
    );

    fireEvent.press(screen.getByLabelText('Take 2, not recorded yet'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByText('2')).toBeNull();
  });
});
