import { STATUS_LABELS } from "@/lib/format";
import { REQUEST_STATUSES, type StatsDto } from "@/lib/types";
import { cn } from "@/lib/utils";
import { STATUS_STYLES } from "./status-badge";

/** One stacked bar of requests by status. Plain divs: no chart library needed. */
export function StatusBreakdownBar({ stats }: { stats: StatsDto }) {
  if (stats.total === 0) return null;
  const segments = REQUEST_STATUSES.map((status) => ({
    status,
    count: stats.byStatus[status],
    percent: (stats.byStatus[status] / stats.total) * 100,
  }));

  return (
    <div className="space-y-3 rounded-xl border bg-background p-4">
      <p className="text-sm font-medium">Requests by status</p>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={segments
          .map((s) => `${STATUS_LABELS[s.status]} ${s.count}`)
          .join(", ")}
      >
        {segments.map(
          (segment) =>
            segment.count > 0 && (
              <div
                key={segment.status}
                className={cn("h-full transition-[width] duration-500", STATUS_STYLES[segment.status].bar)}
                style={{ width: `${segment.percent}%` }}
              />
            ),
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {segments.map((segment) => (
          <li key={segment.status} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", STATUS_STYLES[segment.status].bar)} aria-hidden />
            {STATUS_LABELS[segment.status]}
            <span className="text-muted-foreground tabular-nums">
              {segment.count} ({Math.round(segment.percent)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
