import { QueryClient } from '@tanstack/react-query';
import { isApiError } from '../types/api/errors';
import { isAuthError } from './authError';

const DEFAULT_QUERY_RETRIES = 3;
export const DEFAULT_MUTATION_RETRIES = 1;

/** Shared retry policy aligned with {@link ApiError.isRetryable}. */
export function shouldRetryApiRequest(
  failureCount: number,
  error: unknown,
  maxRetries: number,
): boolean {
  if (failureCount >= maxRetries) {
    return false;
  }

  if (isAuthError(error)) {
    return false;
  }

  if (isApiError(error)) {
    return error.isRetryable;
  }

  return false;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          shouldRetryApiRequest(failureCount, error, DEFAULT_QUERY_RETRIES),
      },
    },
  });
}

export const queryClient = createQueryClient();
