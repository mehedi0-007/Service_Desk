"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";

export default function Home() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status !== "checking") {
      router.replace(status === "authenticated" ? "/requests" : "/login");
    }
  }, [status, router]);

  return null;
}
