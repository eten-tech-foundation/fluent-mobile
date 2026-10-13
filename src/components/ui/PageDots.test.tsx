import React from 'react';
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
});
