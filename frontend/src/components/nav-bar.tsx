"use client";

import { Headset, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/format";
import { signOut } from "@/lib/session";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { ConnectionIndicator } from "./connection-indicator";

export function NavBar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const [signingOut, setSigningOut] = useState(false);

  const links = [
    { href: "/requests", label: "Requests" },
    ...(user?.role === "SUPERVISOR" ? [{ href: "/dashboard", label: "Dashboard" }] : []),
    { href: "/account", label: "Account" },
  ];

  // Ends the session on the server; the app layout then clears the data and shows the login page.
  const onLogout = async () => {
    setSigningOut(true);
    await signOut();
  };

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Wraps on narrow screens, so the three links never push the page sideways. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/requests" className="flex items-center gap-2 font-semibold">
            <Headset className="size-5" aria-hidden />
            Service Desk
          </Link>
          <nav aria-label="Main" className="flex flex-wrap gap-1">
            {links.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                    active ? "bg-muted font-medium" : "text-muted-foreground",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ConnectionIndicator />
          {user && (
            <span className="flex items-center gap-2 text-sm">
              {user.name}
              <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
            </span>
          )}
          <Button variant="outline" size="sm" onClick={onLogout} loading={signingOut}>
            <LogOut aria-hidden />
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}
