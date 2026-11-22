import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { createAppQueryClient } from './query-client';

export function QueryProvider({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [defaultClient] = useState(() => client ?? createAppQueryClient());
  return <QueryClientProvider client={defaultClient}>{children}</QueryClientProvider>;
}
