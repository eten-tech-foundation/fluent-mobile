import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ComponentGalleryScreen from './ComponentGalleryScreen';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';
import { nextColorRoles } from '../../theme/nextRoles';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    canGoBack: () => true,
    back: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock('../../assets/icons/trash-open.svg', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return () => MockReact.createElement(View);
});

jest.mock('../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
  MAX_DEVICE_ACCOUNTS: 3,
}));

const background = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style).backgroundColor;

describe('ComponentGalleryScreen', () => {
  beforeEach(() => mockPreferenceStore());

  it('keeps pinned entries in their own mode when the stage changes', () => {
    render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <ComponentGalleryScreen />
      </SafeAreaProvider>,
    );

    fireEvent.press(screen.getByText('Canvas'));

    expect(background('gallery-stage')).toBe(nextColorRoles.canvas.bgDefault);
    expect(background('gallery-pinned-key')).toBe(
      nextColorRoles.hardware.bgDefault,
    );
  });
});
