import React, { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // gcTime Infinity schedules no cache-GC timer; the 5 min default kept
      // Jest workers alive past the run ("failed to exit gracefully").
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}

export function QueryClientTestWrapper({
  children,
  client = createTestQueryClient(),
}: PropsWithChildren<{ client?: QueryClient }>) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
