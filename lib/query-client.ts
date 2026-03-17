import { QueryClient } from '@tanstack/react-query';

export const TAB_QUERY_STALE_TIME = 60 * 1000;
export const TAB_QUERY_GC_TIME = 10 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: TAB_QUERY_STALE_TIME,
      gcTime: TAB_QUERY_GC_TIME,
      retry: 1,
      refetchOnMount: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});
