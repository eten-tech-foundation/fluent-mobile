import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import V2HomeScreen from './HomeScreen';

const mockPush = jest.fn();
let mockGalleryEnabled = false;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

jest.mock('../../../config/componentGallery', () => ({
  isComponentGalleryEnabled: () => mockGalleryEnabled,
}));

describe('V2HomeScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockGalleryEnabled = false;
  });

  it.each([
    ['v2-home-settings', '/(app)/settings'],
    ['v2-home-sync', '/(app)/(stack)/sync'],
  ])('%s opens the v1 screen', (testID, href) => {
    render(<V2HomeScreen />);
    fireEvent.press(screen.getByTestId(testID));
    expect(mockPush).toHaveBeenCalledWith(href);
  });

  it('opens Prepare for Offline', () => {
    render(<V2HomeScreen />);
    fireEvent.press(screen.getByTestId('v2-home-prepare-offline'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/(stack)/prepare-for-offline',
      }),
    );
  });

  it('shows the gallery link only when the gallery flag is on', () => {
    render(<V2HomeScreen />);
    expect(screen.queryByTestId('v2-home-gallery')).toBeNull();

    mockGalleryEnabled = true;
    render(<V2HomeScreen />);
    fireEvent.press(screen.getByTestId('v2-home-gallery'));
    expect(mockPush).toHaveBeenCalledWith('/gallery');
  });
});
