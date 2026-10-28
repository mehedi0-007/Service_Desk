"use client";

import { Inbox } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ActivityFeed } from "@/components/activity-feed";
import { RequestList, RequestListSkeleton } from "@/components/request-list";
import { StatCards, StatCardsSkeleton } from "@/components/stat-cards";
import { StatusBreakdownBar } from "@/components/status-breakdown-bar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useRequestList, useStats } from "@/hooks/use-requests";
import type { RequestListQuery } from "@/lib/types";
import { useAuthStore } from "@/stores/auth-store";

const ACTIVE_QUERY: RequestListQuery = {
  status: ["QUEUED", "IN_PROGRESS"],
  sortBy: "createdAt",
  sortOrder: "asc",
  page: 1,
  pageSize: 50,
};

export default function DashboardPage() {
  const router = useRouter();
  const supervisor = useAuthStore((s) => s.user?.role === "SUPERVISOR");
  const stats = useStats(supervisor);
  const active = useRequestList(ACTIVE_QUERY);

  useEffect(() => {
    if (!supervisor) router.replace("/requests");
  }, [supervisor, router]);

  if (!supervisor) return null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Updates live as requests are submitted and processed.
        </p>
      </div>

      {stats.data ? (
        <>
          <StatCards stats={stats.data} />
          <StatusBreakdownBar stats={stats.data} />
        </>
      ) : stats.isError ? (
        <EmptyState icon={Inbox} title="Could not load statistics" hint={stats.error.message}>
          <Button variant="outline" size="sm" onClick={() => stats.refetch()}>
            Try again
          </Button>
        </EmptyState>
      ) : (
        <StatCardsSkeleton />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-labelledby="active-requests" className="min-w-0 space-y-3 lg:col-span-2">
          <h2 id="active-requests" className="font-semibold">
            Active requests
            {active.data && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {active.data.meta.total}
              </span>
            )}
          </h2>
          {active.isPending ? (
            <RequestListSkeleton />
          ) : active.isError ? (
            <EmptyState icon={Inbox} title="Could not load requests" hint={active.error.message} />
          ) : active.data.items.length === 0 ? (
            <EmptyState icon={Inbox} title="Nothing in the queue" hint="New requests appear here instantly." />
          ) : (
            <RequestList requests={active.data.items} showPeople compact />
          )}
        </section>
        <aside className="min-w-0">
          <ActivityFeed />
        </aside>
      </div>
    </div>
  );
}
