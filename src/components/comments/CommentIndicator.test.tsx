import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { CommentIndicator } from './CommentIndicator';

jest.mock('lucide-react-native', () => {
  const ReactNative = require('react-native');
  const Mock = (props: { testID?: string }) => (
    <ReactNative.View testID={props.testID} />
  );
  return { MessageSquare: Mock };
});

describe('CommentIndicator', () => {
  it('renders message-square only for a real positive count', () => {
    const view = render(<CommentIndicator count={3} />);
    expect(view.getByTestId('comment-indicator-count')).toHaveTextContent('3');
    expect(view.getByTestId('comment-indicator-icon')).toBeTruthy();
  });

  it('does not fake a zero when count is unknown or zero', () => {
    expect(render(<CommentIndicator count={null} />).toJSON()).toBeNull();
    expect(render(<CommentIndicator count={undefined} />).toJSON()).toBeNull();
    expect(render(<CommentIndicator count={0} />).toJSON()).toBeNull();
  });

  it('invokes onPress when provided', () => {
    const onPress = jest.fn();
    const view = render(<CommentIndicator count={2} onPress={onPress} />);
    fireEvent.press(view.getByTestId('comment-indicator-press'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
