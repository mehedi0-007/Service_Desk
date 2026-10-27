"use client";

import { Activity } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRef, formatTime, STAGE_LABELS, STATUS_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRealtimeStore, type FeedEvent } from "@/stores/realtime-store";
import { STATUS_STYLES } from "./status-badge";

function describe(event: FeedEvent): string {
  if (event.kind === "created") return "Submitted";
  if (event.kind === "progress" || event.status === "IN_PROGRESS") {
    const stage = event.stage ? ` · ${STAGE_LABELS[event.stage]}` : "";
    return `In progress · ${event.progress}%${stage}`;
  }
  if (event.status === "FAILED" && event.failureReason) {
    return `Failed: ${event.failureReason}`;
  }
  return STATUS_LABELS[event.status];
}

/** The latest events received over the WebSocket; built without any extra API calls. */
export function ActivityFeed() {
  const events = useRealtimeStore((s) => s.events);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-4" aria-hidden />
          Live activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Waiting for activity…</p>
        ) : (
          <ol className="space-y-1" aria-live="polite" aria-relevant="additions">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/requests/${event.id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span
                    className={cn("size-2 shrink-0 rounded-full", STATUS_STYLES[event.status].bar)}
                    aria-hidden
                  />
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatTime(event.at)}
                  </span>
                  <span className="shrink-0 font-mono text-xs">{formatRef(event.referenceNo)}</span>
                  <span className="truncate">{describe(event)}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
