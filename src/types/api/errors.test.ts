import { ApiError, isRetryableApiError } from './errors';

describe('ApiError', () => {
  it('classifies 5xx responses as retryable', () => {
    const error = new ApiError(503, 'Service unavailable');
    expect(error.isRetryable).toBe(true);
    expect(error.isTerminal).toBe(false);
    expect(isRetryableApiError(error)).toBe(true);
  });

  it('classifies network failures (status 0) as retryable', () => {
    const error = new ApiError(0, 'Network request failed');
    expect(error.isRetryable).toBe(true);
    expect(error.isTerminal).toBe(false);
  });

  it('classifies 4xx responses as terminal and not retryable', () => {
    const error = new ApiError(422, 'Validation failed', 'VALIDATION');
    expect(error.isRetryable).toBe(false);
    expect(error.isTerminal).toBe(true);
    expect(error.code).toBe('VALIDATION');
  });

  it('classifies 401 as terminal but not retryable via helper', () => {
    const error = new ApiError(401, 'Unauthorized');
    expect(error.isTerminal).toBe(true);
    expect(isRetryableApiError(error)).toBe(false);
  });
});
