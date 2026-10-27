"use client";

import { cn } from "@/lib/utils";
import { useRealtimeStore, type ConnectionStatus } from "@/stores/realtime-store";

const STATES: Record<ConnectionStatus, { label: string; dot: string }> = {
  live: { label: "Live", dot: "bg-green-500" },
  connecting: { label: "Connecting…", dot: "bg-amber-400 animate-pulse" },
  offline: { label: "Offline", dot: "bg-neutral-400" },
};

export function ConnectionIndicator() {
  const status = useRealtimeStore((s) => s.status);
  const { label, dot } = STATES[status];
  return (
    <span
      role="status"
      title="Real-time connection"
      className="flex items-center gap-1.5 text-sm text-muted-foreground"
    >
      <span className={cn("size-2 rounded-full", dot)} aria-hidden />
      {label}
    </span>
  );
}
