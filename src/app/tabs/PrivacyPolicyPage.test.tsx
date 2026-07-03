import React from 'react';
import { render, screen } from '@testing-library/react-native';
import PrivacyPolicyPage from './PrivacyPolicyPage';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: jest.fn(),
  }),
}));

describe('PrivacyPolicyPage', () => {
  it('renders scrollable privacy policy content', () => {
    render(<PrivacyPolicyPage />);

    expect(screen.getByTestId('privacy-policy-scroll')).toBeTruthy();
    expect(screen.getAllByText('Privacy Policy').length).toBeGreaterThan(0);
    expect(screen.getByTestId('privacy-policy-scroll-back')).toBeTruthy();
  });
});
