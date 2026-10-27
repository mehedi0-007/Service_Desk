"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { NavBar } from "@/components/nav-bar";
import { useAuthStore } from "@/stores/auth-store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (hasHydrated && !token) router.replace("/login");
  }, [hasHydrated, token, router]);

  if (!hasHydrated || !token) return null;

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </>
  );
}
