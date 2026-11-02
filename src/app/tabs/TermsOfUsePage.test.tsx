import React from 'react';
import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import TermsOfUsePage from './TermsOfUsePage';

const mockBack = jest.fn();
const mockCanGoBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    canGoBack: mockCanGoBack,
    replace: mockReplace,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('TermsOfUsePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  it('renders scrollable terms content', () => {
    render(<TermsOfUsePage />);

    expect(screen.getByTestId('terms-of-use-scroll')).toBeTruthy();
    expect(screen.getAllByText('Terms of Use').length).toBeGreaterThan(0);
    expect(screen.getByTestId('terms-of-use-scroll-back')).toBeTruthy();

    const content = within(screen.getByTestId('terms-of-use-scroll'));
    expect(content.getByText(/not constitute authoritative/)).toBeTruthy();
    expect(content.getByText(/you acknowledge that/)).toBeTruthy();
    expect(content.getByText(/final translation responsibility/)).toBeTruthy();
    expect(content.getByText(/provided by third parties/)).toBeTruthy();
  });

  it('uses router back when the legal header has navigation history', () => {
    render(<TermsOfUsePage />);
    fireEvent.press(screen.getByTestId('terms-of-use-scroll-back'));
    expect(mockCanGoBack).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('replaces with the existing Home route when no back history exists', () => {
    mockCanGoBack.mockReturnValue(false);
    render(<TermsOfUsePage />);
    fireEvent.press(screen.getByTestId('terms-of-use-scroll-back'));
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(app)/(stack)' }),
    );
  });
});
