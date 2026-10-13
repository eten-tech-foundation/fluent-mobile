import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { ProgressDots } from './ProgressDots';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

function colorOf(testID: string) {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style)
    .backgroundColor;
}

describe('ProgressDots', () => {
  beforeEach(() => {
    mockPreferenceStore();
  });

  it('highlights only the current item', () => {
    render(
      <ProgressDots
        count={16}
        index={2}
        accessibilityLabel="Pericope 3 of 16"
        testID="d"
      />,
    );

    expect(colorOf('d-dot-2')).not.toBe(colorOf('d-dot-0'));
    expect(colorOf('d-dot-15')).toBe(colorOf('d-dot-0'));
    expect(screen.queryByTestId('d-dot-16')).toBeNull();
  });

  it('is read as one element with the position', () => {
    render(
      <ProgressDots
        count={16}
        index={2}
        accessibilityLabel="Pericope 3 of 16"
      />,
    );

    expect(screen.getByLabelText('Pericope 3 of 16').props.accessible).toBe(
      true,
    );
  });
});
