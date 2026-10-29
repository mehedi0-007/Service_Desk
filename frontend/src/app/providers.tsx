"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { refreshSession, watchOtherTabs } from "@/lib/session";
import { hadSession, useAuthStore } from "@/stores/auth-store";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Live data arrives over the WebSocket, so queries never poll.
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );

  // The access token lives in memory, so a page load starts by exchanging the refresh cookie,
  // unless this browser has no session to restore.
  useEffect(() => {
    if (hadSession()) void refreshSession();
    else useAuthStore.getState().clear();
    return watchOtherTabs();
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
