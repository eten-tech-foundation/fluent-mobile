import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PageHeaderBackButton } from './PageHeaderBackButton';

jest.mock('lucide-react-native', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockIcon = () => MockReact.createElement(View);
  return { ChevronLeft: MockIcon };
});

describe('PageHeaderBackButton', () => {
  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();

    await render(<PageHeaderBackButton onPress={onPress} />);

    await fireEvent.press(screen.getByLabelText('Go back'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
