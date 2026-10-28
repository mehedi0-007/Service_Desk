import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/format";
import {
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  type RequestPriority,
  type StatsDto,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { STATUS_STYLES } from "./status-badge";

const PRIORITY_COLORS: Record<RequestPriority, string> = {
  LOW: "bg-neutral-400",
  MEDIUM: "bg-blue-500",
  HIGH: "bg-orange-500",
  URGENT: "bg-red-500",
};

type Segment = { key: string; label: string; count: number; color: string };

/** One stacked horizontal bar with a legend. Plain divs: no chart library needed. */
function BreakdownBar({
  title,
  total,
  segments,
}: {
  title: string;
  total: number;
  segments: Segment[];
}) {
  const percent = (count: number) => (count / total) * 100;
  return (
    <div className="space-y-3 rounded-xl border bg-background p-4">
      <p className="text-sm font-medium">{title}</p>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${title}: ${segments.map((s) => `${s.label} ${s.count}`).join(", ")}`}
      >
        {segments.map(
          (segment) =>
            segment.count > 0 && (
              <div
                key={segment.key}
                className={cn("h-full transition-[width] duration-500", segment.color)}
                style={{ width: `${percent(segment.count)}%` }}
              />
            ),
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", segment.color)} aria-hidden />
            {segment.label}
            <span className="text-muted-foreground tabular-nums">
              {segment.count} ({Math.round(percent(segment.count))}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Requests by status and by priority; hidden while there are no requests. */
export function StatusBreakdownBar({ stats }: { stats: StatsDto }) {
  if (stats.total === 0) return null;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <BreakdownBar
        title="Requests by status"
        total={stats.total}
        segments={REQUEST_STATUSES.map((status) => ({
          key: status,
          label: STATUS_LABELS[status],
          count: stats.byStatus[status],
          color: STATUS_STYLES[status].bar,
        }))}
      />
      <BreakdownBar
        title="Requests by priority"
        total={stats.total}
        segments={REQUEST_PRIORITIES.map((priority) => ({
          key: priority,
          label: PRIORITY_LABELS[priority],
          count: stats.byPriority[priority],
          color: PRIORITY_COLORS[priority],
        }))}
      />
    </div>
  );
}
