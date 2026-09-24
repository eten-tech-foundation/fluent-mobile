import React from 'react';
import { render } from '@testing-library/react-native';
import { ChapterOwnershipIndicator } from './ChapterOwnershipIndicator';

jest.mock('lucide-react-native', () => {
  const ReactNative = require('react-native');
  const Mock = (props: { accessibilityLabel?: string }) => (
    <ReactNative.View accessibilityLabel={props.accessibilityLabel} />
  );
  return { User: Mock };
});

describe('ChapterOwnershipIndicator', () => {
  it('renders nothing for unassigned', () => {
    const { queryByTestId } = render(
      <ChapterOwnershipIndicator ownershipState="unassigned" />,
    );

    expect(queryByTestId('chapter-ownership-mine')).toBeNull();
    expect(queryByTestId('chapter-ownership-other')).toBeNull();
  });

  it('exposes mine testID and a11y label', () => {
    const { getByTestId, getByLabelText } = render(
      <ChapterOwnershipIndicator ownershipState="mine" />,
    );

    expect(getByTestId('chapter-ownership-mine')).toBeTruthy();
    expect(getByLabelText('Assigned to you')).toBeTruthy();
  });

  it('exposes other testID and a11y label', () => {
    const { getByTestId, getByLabelText } = render(
      <ChapterOwnershipIndicator ownershipState="other" />,
    );

    expect(getByTestId('chapter-ownership-other')).toBeTruthy();
    expect(getByLabelText('Assigned to another translator')).toBeTruthy();
  });
});
