import React from 'react';
import { render } from '@testing-library/react-native';
import { ChapterConflictIndicator } from './ChapterConflictIndicator';

jest.mock('lucide-react-native', () => {
  const ReactNative = require('react-native');
  const Mock = ({ accessibilityLabel }: { accessibilityLabel?: string }) => (
    <ReactNative.View accessibilityLabel={accessibilityLabel} />
  );
  return {
    Users: Mock,
    TriangleAlert: Mock,
  };
});

describe('ChapterConflictIndicator', () => {
  it('exposes an accessibility label for unresolved conflicts', () => {
    const { getByLabelText, getByTestId } = render(
      <ChapterConflictIndicator />,
    );

    expect(getByTestId('chapter-conflict-indicator')).toBeTruthy();
    expect(getByLabelText('Unresolved recording conflict')).toBeTruthy();
  });
});
