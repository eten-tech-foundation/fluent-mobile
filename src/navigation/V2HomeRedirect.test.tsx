import React from 'react';
import { render } from '@testing-library/react-native';
import { V2HomeRedirect } from './V2HomeRedirect';

const mockDismissTo = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ dismissTo: mockDismissTo }),
}));

describe('V2HomeRedirect', () => {
  it('returns to v2 Home, reusing it if it is already in the stack', () => {
    render(<V2HomeRedirect />);
    expect(mockDismissTo).toHaveBeenCalledWith('/v2');
  });
});
