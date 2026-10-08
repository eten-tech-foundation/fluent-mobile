import { isApiError } from '../types/api/errors';

/** Thrown when an upload pass stops because the link dropped. */
export const UPLOAD_NETWORK_INTERRUPTED_ERROR_NAME =
  'UploadNetworkInterruptedError';

const NETWORK_TRANSPORT_MESSAGE_RE =
  /unknownhost|unable to resolve host|no address associated with hostname|network request failed|failed to fetch|fetch failed|err_internet_disconnected|econnrefused|enotfound|etimedout|econnreset|socket hang up|network is unreachable|java\.net\.(socket|unknownhost|connect)/i;

export function isNetworkTransportErrorMessage(raw: string): boolean {
  return NETWORK_TRANSPORT_MESSAGE_RE.test(raw);
}

export function isNetworkTransportError(error: unknown): boolean {
  if (isApiError(error) && error.status === 0) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  return isNetworkTransportErrorMessage(message);
}

export function isUploadNetworkInterruptedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === UPLOAD_NETWORK_INTERRUPTED_ERROR_NAME
  );
}

export class UploadNetworkInterruptedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = UPLOAD_NETWORK_INTERRUPTED_ERROR_NAME;
  }
}
