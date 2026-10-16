import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { PageDots } from './PageDots';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

describe('PageDots', () => {
  beforeEach(() => {
    mockPreferenceStore();
  });

  it('draws one dot per page', () => {
    render(
      <PageDots
        count={7}
        index={1}
        accessibilityLabel="Page 2 of 7"
        testID="p"
      />,
    );

    expect(screen.getByTestId('p-dot-6')).toBeTruthy();
    expect(screen.queryByTestId('p-dot-7')).toBeNull();
  });

  it('is read as one element with the page position', () => {
    render(
      <PageDots
        count={7}
        index={1}
        accessibilityLabel="Page 2 of 7"
        testID="p"
      />,
    );

    const row = screen.getByLabelText('Page 2 of 7');
    expect(row.props.accessible).toBe(true);
  });

  function dot(testID: string) {
    return StyleSheet.flatten(screen.getByTestId(testID).props.style);
  }

  it('grows and darkens the current page', () => {
    render(
      <PageDots
        count={7}
        index={1}
        accessibilityLabel="Page 2 of 7"
        testID="p"
      />,
    );

    expect(dot('p-dot-1').width).toBe(14);
    expect(dot('p-dot-0').width).toBe(10);
    expect(dot('p-dot-6').width).toBe(10);
    expect(dot('p-dot-1').backgroundColor).not.toBe(
      dot('p-dot-0').backgroundColor,
    );
  });

  it('clamps an out-of-range index to the last page', () => {
    render(
      <PageDots
        count={3}
        index={9}
        accessibilityLabel="Page 3 of 3"
        testID="p"
      />,
    );
    expect(dot('p-dot-2').width).toBe(14);
  });
});
