import { Badge } from "@/components/ui/badge";
import { PRIORITY_LABELS } from "@/lib/format";
import type { RequestPriority } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRIORITY_STYLES: Record<RequestPriority, string> = {
  LOW: "border-neutral-300 text-neutral-600",
  MEDIUM: "border-blue-300 text-blue-700",
  HIGH: "border-orange-300 text-orange-700",
  URGENT: "border-red-300 bg-red-50 text-red-700",
};

export function PriorityBadge({ priority }: { priority: RequestPriority }) {
  return (
    <Badge variant="outline" className={cn(PRIORITY_STYLES[priority])}>
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}
