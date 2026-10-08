import {
  ApiError,
  isRetryableApiError,
  isTransientTransportFailure,
} from './errors';

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

  it('treats status-0, timeout, and DNS errors as transient transport failures', () => {
    expect(
      isTransientTransportFailure(new ApiError(0, 'Unable to resolve host')),
    ).toBe(true);
    expect(isTransientTransportFailure(new Error('Request timed out'))).toBe(
      true,
    );
    expect(
      isTransientTransportFailure(
        new Error('Unable to resolve host api.fluent.bible'),
      ),
    ).toBe(true);
    const abort = new Error('Aborted');
    abort.name = 'AbortError';
    expect(isTransientTransportFailure(abort)).toBe(true);
  });

  it('does not treat auth or server errors as transient transport failures', () => {
    expect(isTransientTransportFailure(new ApiError(401, 'Unauthorized'))).toBe(
      false,
    );
    expect(isTransientTransportFailure(new ApiError(500, 'Internal'))).toBe(
      false,
    );
    expect(
      isTransientTransportFailure(new ApiError(504, 'Gateway timeout')),
    ).toBe(false);
    expect(
      isTransientTransportFailure(new Error('Failed to sync 1 pending claim')),
    ).toBe(false);
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

  it('preserves parsed body when provided', () => {
    const body = { currentVersionToken: 5, customField: 'value' };
    const error = new ApiError(409, 'Conflict', 'CONFLICT', body);

    expect(error.body).toEqual(body);
    expect(error.body?.currentVersionToken).toBe(5);
    expect(error.body?.customField).toBe('value');
  });

  it('accepts undefined body', () => {
    const error = new ApiError(500, 'Internal error');

    expect(error.body).toBeUndefined();
  });
});
