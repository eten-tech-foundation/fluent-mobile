import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { PageHeader } from './PageHeader';

jest.mock('../../assets/icons/fluent-logo-white.svg', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return () => MockReact.createElement(View, { testID: 'fluent-logo' });
});

describe('PageHeader', () => {
  it('renders the Fluent logo when no title is provided', () => {
    render(<PageHeader />);

    expect(screen.getByTestId('fluent-logo')).toBeTruthy();
  });

  it('renders a centered title when provided', () => {
    render(<PageHeader title="Settings" />);

    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('renders left and right icon slots', () => {
    render(
      <PageHeader
        title="Settings"
        leftIcon={<Text testID="left-icon">Left</Text>}
        rightIcon={<Text testID="right-icon">Right</Text>}
      />,
    );

    expect(screen.getByTestId('left-icon')).toBeTruthy();
    expect(screen.getByTestId('right-icon')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
  });
});
