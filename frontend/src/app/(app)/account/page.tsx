"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ChangePasswordForm } from "@/components/change-password-form";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { signOutEverywhere } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";

export default function AccountPage() {
  const user = useAuthStore((s) => s.user);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  // On success the session ends here too; the app layout shows the login page.
  const onSignOutEverywhere = async () => {
    setPending(true);
    try {
      await signOutEverywhere();
    } catch (error) {
      setPending(false);
      setConfirming(false);
      toast.error(error instanceof Error ? error.message : "Could not sign out. Try again.");
    }
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Account</h1>

      <Card>
        <CardHeader>
          <CardTitle>{user.name}</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            {user.email}
            <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            You stay signed in here; your other devices are signed out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>
            Signed in on a shared or lost device? End every session, including this one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => setConfirming(true)}>
            <LogOut aria-hidden />
            Sign out of all devices
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Sign out of all devices?"
        description="Every browser where you are signed in, including this one, will need to sign in again."
        confirmLabel="Sign out everywhere"
        cancelLabel="Cancel"
        pending={pending}
        onConfirm={onSignOutEverywhere}
      />
    </div>
  );
}
