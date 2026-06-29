import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SettingsButton } from './SettingsButton';

jest.mock('lucide-react-native', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockIcon = () => MockReact.createElement(View);
  return { Settings: MockIcon };
});

describe('SettingsButton', () => {
  it('calls onPress when pressed', () => {
    const onPress = jest.fn();

    render(<SettingsButton onPress={onPress} />);

    fireEvent.press(screen.getByLabelText('Settings'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
