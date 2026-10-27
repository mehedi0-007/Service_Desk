import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/format";
import type { RequestStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const STATUS_STYLES: Record<RequestStatus, { badge: string; bar: string }> = {
  QUEUED: { badge: "bg-neutral-100 text-neutral-700", bar: "bg-neutral-400" },
  IN_PROGRESS: { badge: "bg-blue-100 text-blue-800", bar: "bg-blue-500" },
  COMPLETED: { badge: "bg-green-100 text-green-800", bar: "bg-green-500" },
  FAILED: { badge: "bg-red-100 text-red-800", bar: "bg-red-500" },
  CANCELLED: { badge: "bg-slate-200 text-slate-700", bar: "bg-slate-500" },
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <Badge className={cn(STATUS_STYLES[status].badge)}>{STATUS_LABELS[status]}</Badge>
  );
}
