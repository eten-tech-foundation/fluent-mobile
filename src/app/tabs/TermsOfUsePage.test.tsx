import React from 'react';
import { render, screen } from '@testing-library/react-native';
import TermsOfUsePage from './TermsOfUsePage';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
  }),
}));

describe('TermsOfUsePage', () => {
  it('renders scrollable terms content', () => {
    render(<TermsOfUsePage />);

    expect(screen.getByTestId('terms-of-use-scroll')).toBeTruthy();
    expect(screen.getAllByText('Terms of Use').length).toBeGreaterThan(0);
    expect(screen.getByTestId('terms-of-use-scroll-back')).toBeTruthy();
  });
});
