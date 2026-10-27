import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, STATUS_LABELS } from "@/lib/format";
import type { HistoryEntryDto } from "@/lib/types";
import { cn } from "@/lib/utils";
import { STATUS_STYLES } from "./status-badge";

export function StatusTimeline({ entries }: { entries: HistoryEntryDto[] }) {
  return (
    <ol className="space-y-4">
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative flex gap-3">
          {index < entries.length - 1 && (
            <span className="absolute top-4 left-[5px] h-full w-px bg-border" aria-hidden />
          )}
          <span
            className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", STATUS_STYLES[entry.toStatus].bar)}
            aria-hidden
          />
          <div className="min-w-0 space-y-0.5">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
              {entry.fromStatus && (
                <>
                  <span className="text-muted-foreground">{STATUS_LABELS[entry.fromStatus]}</span>
                  <ArrowRight className="size-3.5 text-muted-foreground" aria-label="to" />
                </>
              )}
              {STATUS_LABELS[entry.toStatus]}
            </p>
            <p className="text-xs text-muted-foreground">
              {entry.changedBy?.name ?? "System"} · {formatDateTime(entry.createdAt)}
            </p>
            {entry.note && <p className="text-sm break-words">{entry.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function StatusTimelineSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-2.5 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}
