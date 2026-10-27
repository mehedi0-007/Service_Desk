import {
  Ban,
  CheckCircle2,
  Clock,
  Cpu,
  Hourglass,
  Layers,
  Loader,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDuration, STATUS_LABELS } from "@/lib/format";
import type { RequestStatus, StatsDto } from "@/lib/types";

const STATUS_ICONS: Record<RequestStatus, { icon: LucideIcon; color: string }> = {
  QUEUED: { icon: Hourglass, color: "text-neutral-500" },
  IN_PROGRESS: { icon: Loader, color: "text-blue-600" },
  COMPLETED: { icon: CheckCircle2, color: "text-green-600" },
  FAILED: { icon: XCircle, color: "text-red-600" },
  CANCELLED: { icon: Ban, color: "text-slate-500" },
};

const show = (value: number | null) => (value === null ? "—" : String(value));

export function StatCards({ stats }: { stats: StatsDto }) {
  const { queue } = stats;
  const cards = [
    { label: "Total requests", value: String(stats.total), icon: Layers, color: "text-foreground" },
    ...(Object.keys(STATUS_ICONS) as RequestStatus[]).map((status) => ({
      label: STATUS_LABELS[status],
      value: String(stats.byStatus[status]),
      ...STATUS_ICONS[status],
    })),
    {
      label: "Queue: waiting / active",
      value: `${show(queue.waiting)} / ${show(queue.active)}`,
      hint: `${queue.workerConcurrency} workers${queue.waiting === null ? " · queue unreachable" : ""}`,
      icon: Cpu,
      color: "text-violet-600",
    },
    {
      label: "Avg processing time",
      value: formatDuration(stats.avgProcessingSeconds),
      hint: "Completed requests",
      icon: Clock,
      color: "text-amber-600",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="py-4">
          <CardContent className="flex items-start justify-between gap-3 px-4">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{card.value}</p>
              {"hint" in card && card.hint && (
                <p className="text-xs text-muted-foreground">{card.hint}</p>
              )}
            </div>
            <card.icon className={`size-5 shrink-0 ${card.color}`} aria-hidden />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function StatCardsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-busy aria-label="Loading statistics">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-[88px] rounded-xl" />
      ))}
    </div>
  );
}
