import React from 'react';
import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import PrivacyPolicyPage from './PrivacyPolicyPage';

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
jest.mock('../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('PrivacyPolicyPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });
  it('renders scrollable privacy policy content', () => {
    render(<PrivacyPolicyPage />);

    expect(screen.getByTestId('privacy-policy-scroll')).toBeTruthy();
    expect(screen.getAllByText('Privacy Policy').length).toBeGreaterThan(0);
    expect(screen.getByTestId('privacy-policy-scroll-back')).toBeTruthy();

    const content = within(screen.getByTestId('privacy-policy-scroll'));
    const first = content.getByText(
      /^Fluent offers an AI-generated draft feature/,
    );
    // Existing copy evidence only: contradictory alternatives remain unresolved in #725.
    expect(first).toHaveTextContent(
      'Your data will not be used for model training. OR Your data may be used for model training.',
      { exact: false },
    );
    expect(first).toHaveTextContent(
      'must be reviewed by a human translator before acceptance.',
      { exact: false },
    );
    expect(content.getByText(/^Unless specified otherwise/)).toHaveTextContent(
      'By continuing, you agree to the use of your translations to aid with creating AI-generated content.',
      { exact: false },
    );
  });

  it('uses router back when the legal header has navigation history', () => {
    render(<PrivacyPolicyPage />);
    fireEvent.press(screen.getByTestId('privacy-policy-scroll-back'));
    expect(mockCanGoBack).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('replaces with the existing Home route when no back history exists', () => {
    mockCanGoBack.mockReturnValue(false);
    render(<PrivacyPolicyPage />);
    fireEvent.press(screen.getByTestId('privacy-policy-scroll-back'));
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/(stack)',
      params: undefined,
    });
  });
});
