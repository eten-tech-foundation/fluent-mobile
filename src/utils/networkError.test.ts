import { ApiError } from '../types/api/errors';
import {
  isNetworkTransportError,
  isNetworkTransportErrorMessage,
  isUploadNetworkInterruptedError,
  UploadNetworkInterruptedError,
} from './networkError';

describe('networkError', () => {
  it('treats ApiError status 0 as a transport failure', () => {
    expect(isNetworkTransportError(new ApiError(0, 'network down'))).toBe(true);
  });

  it('treats Android UnknownHost copy as a transport failure', () => {
    const message =
      'fetch failed: java.net.UnknownHostException: Unable to resolve host "dev.api.fluent.bible": No address associated with hostname';
    expect(isNetworkTransportErrorMessage(message)).toBe(true);
    expect(isNetworkTransportError(new Error(message))).toBe(true);
  });

  it('does not treat HTTP 500 copy as a transport failure', () => {
    expect(isNetworkTransportError(new ApiError(500, 'server boom'))).toBe(
      false,
    );
    expect(isNetworkTransportErrorMessage('server boom')).toBe(false);
  });

  it('identifies UploadNetworkInterruptedError by name', () => {
    const error = new UploadNetworkInterruptedError('network down');
    expect(isUploadNetworkInterruptedError(error)).toBe(true);
    expect(isUploadNetworkInterruptedError(new Error('network down'))).toBe(
      false,
    );
  });
});
