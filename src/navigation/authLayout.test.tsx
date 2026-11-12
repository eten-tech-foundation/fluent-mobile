import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import AuthLayout from '../routes/(auth)/_layout';
import { hideSplash } from './splashGate';

jest.mock('expo-router', () => ({
  Stack: () => {
    const { Text } = require('react-native');
    return <Text>Login</Text>;
  },
}));

jest.mock('./splashGate', () => ({
  hideSplash: jest.fn(),
}));

describe('auth layout', () => {
  it('takes the splash down once the signed-out screen lays out', () => {
    render(<AuthLayout />);
    expect(hideSplash).not.toHaveBeenCalled();

    // Bubbles to the layout's root view, the nearest onLayout.
    fireEvent(screen.getByText('Login'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 640 } },
    });

    expect(hideSplash).toHaveBeenCalledWith('auth');
  });
});
