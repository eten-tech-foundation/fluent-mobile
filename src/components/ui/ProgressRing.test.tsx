import React from 'react';
import { Pressable, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { ProgressRing } from './ProgressRing';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

describe('ProgressRing', () => {
  beforeEach(() => {
    mockPreferenceStore();
  });

  it('shows nothing at 0 (Figma None) but still announces progress', () => {
    render(<ProgressRing value={0} accessibilityLabel="Download" testID="r" />);

    expect(screen.queryByTestId('r-arc')).toBeNull();
    expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 0,
    });
  });

  it('draws the ring and reports the percent while in progress', () => {
    render(
      <ProgressRing value={0.5} accessibilityLabel="Download" testID="r" />,
    );

    expect(screen.getByTestId('r-arc')).toBeTruthy();
    expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 50,
    });
  });

  it('clamps values outside 0–1', () => {
    const { rerender } = render(
      <ProgressRing value={1.7} accessibilityLabel="Download" />,
    );
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(
      100,
    );

    rerender(<ProgressRing value={-0.2} accessibilityLabel="Download" />);
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(
      0,
    );
  });

  it('keeps its child separately focusable from the progress', () => {
    render(
      <ProgressRing value={0.25} accessibilityLabel="Download">
        <Pressable accessibilityRole="button" accessibilityLabel="Start">
          <Text>button</Text>
        </Pressable>
      </ProgressRing>,
    );

    expect(screen.getByRole('progressbar', { name: 'Download' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
  });
});
