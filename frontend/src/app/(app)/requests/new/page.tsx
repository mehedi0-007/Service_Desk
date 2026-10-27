"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { RequestForm } from "@/components/request-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuthStore } from "@/stores/auth-store";

export default function NewRequestPage() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);

  // Supervisors do not create requests.
  useEffect(() => {
    if (role === "SUPERVISOR") router.replace("/requests");
  }, [role, router]);

  if (role !== "OPERATOR") return null;

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle className="text-xl">New request</CardTitle>
        <CardDescription>
          Describe the problem. It is queued as soon as you submit, and you can follow its
          progress live.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RequestForm />
      </CardContent>
    </Card>
  );
}
