import { ApiError } from '../types/api/errors';
import { AuthError } from './authError';
import { shouldRetryApiRequest } from './queryClient';

describe('shouldRetryApiRequest', () => {
  it('retries retryable ApiError responses until the max', () => {
    const error = new ApiError(503, 'Service unavailable');

    expect(shouldRetryApiRequest(0, error, 3)).toBe(true);
    expect(shouldRetryApiRequest(2, error, 3)).toBe(true);
    expect(shouldRetryApiRequest(3, error, 3)).toBe(false);
  });

  it('does not retry terminal 4xx ApiError responses', () => {
    const error = new ApiError(400, 'Bad request');
    expect(shouldRetryApiRequest(0, error, 3)).toBe(false);
  });

  it('does not retry AuthError responses', () => {
    const error = new AuthError('Invalid session');
    expect(shouldRetryApiRequest(0, error, 3)).toBe(false);
  });

  it('does not retry unknown errors', () => {
    expect(shouldRetryApiRequest(0, new Error('boom'), 3)).toBe(false);
  });
});
