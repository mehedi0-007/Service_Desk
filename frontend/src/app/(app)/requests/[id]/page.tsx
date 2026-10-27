"use client";

import { ArrowLeft, FileQuestion, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PriorityBadge } from "@/components/priority-badge";
import { RequestActions } from "@/components/request-actions";
import { StatusBadge } from "@/components/status-badge";
import { StatusTimeline, StatusTimelineSkeleton } from "@/components/status-timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useHistory, useRequest } from "@/hooks/use-requests";
import { ApiError } from "@/lib/api";
import {
  CATEGORY_LABELS,
  formatDateTime,
  formatRef,
  STAGE_LABELS,
} from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const { data: request, isPending, isError, error } = useRequest(id);
  const history = useHistory(id);

  if (isPending) return <DetailSkeleton />;

  if (isError) {
    const notFound =
      error instanceof ApiError && (error.status === 404 || error.status === 400);
    return (
      <EmptyState
        icon={FileQuestion}
        title={notFound ? "Request not found" : "Could not load the request"}
        hint={notFound ? "It does not exist or you do not have access to it." : error.message}
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/requests">Back to requests</Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        href="/requests"
        className="inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All requests
      </Link>

      <Card>
        <CardHeader className="gap-2">
          <p className="font-mono text-sm text-muted-foreground">
            {formatRef(request.referenceNo)}
          </p>
          <CardTitle className="text-xl break-words">{request.title}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={request.status} />
            <PriorityBadge priority={request.priority} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {request.status === "IN_PROGRESS" && (
            <div className="space-y-2" aria-live="polite">
              <div className="flex justify-between text-sm">
                <span>{request.stage ? STAGE_LABELS[request.stage] : "Starting"}…</span>
                <span className="font-medium">{request.progress}%</span>
              </div>
              <Progress
                value={request.progress}
                aria-label="Processing progress"
                className="h-2 [&>[data-slot=progress-indicator]]:bg-blue-500"
              />
            </div>
          )}

          {request.status === "FAILED" && request.failureReason && (
            <div
              role="alert"
              className="flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800"
            >
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              <span>{request.failureReason}</span>
            </div>
          )}

          <p className="text-sm break-words whitespace-pre-wrap">{request.description}</p>

          <dl className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-3">
            <Detail label="Category" value={CATEGORY_LABELS[request.category]} />
            <Detail label="Created by" value={request.createdBy.name} />
            <Detail label="Created" value={formatDateTime(request.createdAt)} />
            <Detail label="Assigned to" value={request.assignedTo?.name ?? "Unassigned"} />
            <Detail label="Attempts" value={String(request.attempts)} />
            <Detail label="Last updated" value={formatDateTime(request.updatedAt)} />
            <Detail label="Started" value={formatDateTime(request.startedAt)} />
            <Detail label="Finished" value={formatDateTime(request.finishedAt)} />
          </dl>

          {user && <RequestActions request={request} user={user} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          {history.data ? (
            <StatusTimeline entries={history.data} />
          ) : history.isError ? (
            <p className="text-sm text-muted-foreground">Could not load the history.</p>
          ) : (
            <StatusTimelineSkeleton />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy aria-label="Loading request">
      <Skeleton className="h-4 w-28" />
      <div className="space-y-4 rounded-xl border bg-background p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
    </div>
  );
}
