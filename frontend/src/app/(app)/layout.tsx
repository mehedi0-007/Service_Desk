"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { NavBar } from "@/components/nav-bar";
import { useRealtime } from "@/hooks/use-realtime";
import { useAuthStore } from "@/stores/auth-store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);

  // Whatever ended the session (logout here or in another tab, revocation, expiry), forget its
  // data and go to the login page.
  useEffect(() => {
    if (status === "anonymous") {
      queryClient.clear();
      router.replace("/login");
    }
  }, [status, queryClient, router]);

  // One WebSocket connection for the whole signed-in app.
  useRealtime();

  if (status !== "authenticated") return null;

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </>
  );
}
