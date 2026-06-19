import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TopBarBackButton } from './TopBarBackButton';

jest.mock('lucide-react-native', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockIcon = () => MockReact.createElement(View);
  return { ChevronLeft: MockIcon };
});

describe('TopBarBackButton', () => {
  it('calls onPress when pressed', () => {
    const onPress = jest.fn();

    render(<TopBarBackButton onPress={onPress} />);

    fireEvent.press(screen.getByLabelText('Go back'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
